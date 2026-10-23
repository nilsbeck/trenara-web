import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { loginSchema } from '$lib/schemas/auth';
import { authApi } from '$lib/server/trenara/auth';
import { TokenManager } from '$lib/server/auth/token-manager';
import { loginByIp, loginByUsername } from '$lib/server/security/rate-limit';
import { HttpError } from '$lib/server/trenara/client';

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

/**
 * One line in the log for every sign-in this app refused.
 *
 * There was none. The limiters below turned credential stuffing away and
 * nobody could tell that it had happened — the failure was answered and
 * forgotten, which is the case OWASP's logging guidance names first.
 *
 * The source IP is what makes the line actionable, so it is here. The
 * username is not, and nor is anything derived from it: §3 of agents.md bars
 * emails from the log, and a hash of an address is reversed by hashing the
 * address. Neither is the error itself — only its status or its class —
 * because Trenara's refusal body is free to echo the submitted username back.
 */
function logRefusedSignIn(ip: string, reason: string): void {
	console.warn(`[auth] sign-in refused from ${ip}: ${reason}`);
}

function describeLoginFailure(e: unknown): string {
	if (e instanceof HttpError) return `upstream ${e.status}`;
	return e instanceof Error ? e.name : 'unknown error';
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
			logRefusedSignIn(ip, `rate limit (${byIp.allowed ? 'account' : 'ip'})`);
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
		} catch (e) {
			logRefusedSignIn(ip, describeLoginFailure(e));
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
