import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { loginSchema } from '$lib/schemas/auth';
import { authApi } from '$lib/server/trenara/auth';
import { TokenManager } from '$lib/server/auth/token-manager';
import { loginByIp, loginByUsername } from '$lib/server/security/rate-limit';

const tokenManager = TokenManager.getInstance();

/**
 * Where to send someone after they sign in.
 *
 * Only a path on this app, never a caller-supplied absolute URL: `next` comes
 * from the query string, and a login form that will redirect anywhere is an
 * open redirect wearing a helpful face. A leading `//` is rejected too — the
 * browser reads that as a protocol-relative URL to another host.
 */
function safeNext(raw: string | null): string {
	if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/dashboard';
	return raw;
}

export const load: PageServerLoad = async ({ locals, url }) => {
	const next = safeNext(url.searchParams.get('next'));

	// Keyed off the resolved session rather than the raw cookie: a stale
	// access-token cookie must not bounce the user back into the app.
	if (locals.user) {
		redirect(302, next);
	}

	return { next };
};

export const actions: Actions = {
	login: async ({ cookies, request, getClientAddress }) => {
		const formData = await request.formData();
		const username = formData.get('username')?.toString() ?? '';
		const password = formData.get('password')?.toString() ?? '';

		const result = loginSchema.safeParse({ username, password });
		if (!result.success) {
			return fail(400, {
				message: result.error.issues[0]?.message ?? 'Invalid input'
			});
		}

		/**
		 * Both limits are counted before the attempt is relayed.
		 *
		 * Counted, not just consulted: an attempt that is refused here still
		 * adds to the tally, so hammering the form does not reset the clock by
		 * arriving faster than it ticks.
		 *
		 * The username is lower-cased for counting so that alternating the case
		 * is not a way around the per-account limit.
		 */
		const ip = getClientAddress();
		const account = result.data.username.toLowerCase();
		const byIp = loginByIp.check(ip);
		const byAccount = loginByUsername.check(account);

		if (!byIp.allowed || !byAccount.allowed) {
			const wait = Math.max(byIp.retryAfterSeconds, byAccount.retryAfterSeconds);
			const minutes = Math.ceil(wait / 60);
			return fail(429, {
				message: `Too many sign-in attempts. Try again in about ${minutes} minute${minutes === 1 ? '' : 's'}.`
			});
		}

		let response;
		try {
			response = await authApi.login({
				username: result.data.username,
				password: result.data.password
			});
		} catch {
			return fail(401, { message: 'Invalid email or password' });
		}

		// A password that worked is not an attack. Clearing both counters means
		// a runner who mistyped twice and then got it right starts clean.
		loginByIp.clear(ip);
		loginByUsername.clear(account);

		tokenManager.setSessionCookies(cookies, response);

		// No identity cookies are written. `hooks.server.ts` resolves the runner
		// from the access token on each request, through the read cache — the
		// only arrangement in which the token and the identity cannot disagree.
		redirect(302, safeNext(formData.get('next')?.toString() ?? null));
	}
};
