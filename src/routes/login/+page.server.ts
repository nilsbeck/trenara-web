import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { loginSchema } from '$lib/schemas/auth';
import { authApi } from '$lib/server/trenara/auth';
import { userApi } from '$lib/server/trenara';
import { TokenManager } from '$lib/server/auth/token-manager';

const tokenManager = TokenManager.getInstance();

export const load: PageServerLoad = async ({ locals }) => {
	// Keyed off the resolved session rather than the raw cookie: a stale
	// access-token cookie must not bounce the user back into the app.
	if (locals.user) {
		redirect(302, '/dashboard');
	}
};

export const actions: Actions = {
	login: async ({ cookies, request }) => {
		const formData = await request.formData();
		const username = formData.get('username')?.toString() ?? '';
		const password = formData.get('password')?.toString() ?? '';

		const result = loginSchema.safeParse({ username, password });
		if (!result.success) {
			return fail(400, {
				message: result.error.issues[0]?.message ?? 'Invalid input'
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

		tokenManager.setSessionCookies(cookies, response);

		// Fetch user profile to persist user_id and email as cookies.
		// A server-signed signature is stored alongside user_id so that
		// hooks.server.ts can verify identity without an extra API call.
		const user = await userApi.getCurrentUser(cookies);
		tokenManager.setIdentityCookies(cookies, { id: user.id, email: user.email });

		redirect(302, '/dashboard');
	}
};
