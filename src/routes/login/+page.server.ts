import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { loginSchema } from '$lib/schemas/auth';
import { authApi } from '$lib/server/trenara/auth';
import { userApi } from '$lib/server/trenara';
import { TokenType } from '$lib/server/auth/types';
import { dev } from '$app/environment';

export const load: PageServerLoad = async ({ cookies }) => {
	if (cookies.get(TokenType.AccessToken)) {
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
				message: result.error.errors[0]?.message ?? 'Invalid input'
			});
		}

		try {
			const response = await authApi.login({
				username: result.data.username,
				password: result.data.password
			});

			const expirationDate = new Date(Date.now() + response.expires_in * 1000);
			const cookieOptions = {
				expires: expirationDate,
				path: '/',
				secure: !dev,
				sameSite: 'lax' as const
			};

			cookies.set(TokenType.AccessToken, response.access_token, {
				...cookieOptions,
				httpOnly: true
			});
			cookies.set(TokenType.RefreshToken, response.refresh_token, {
				...cookieOptions,
				httpOnly: true
			});
			cookies.set(
				`${TokenType.AccessToken}_expiration`,
				expirationDate.toISOString(),
				cookieOptions
			);
			cookies.set(
				`${TokenType.RefreshToken}_expiration`,
				expirationDate.toISOString(),
				cookieOptions
			);

			// Fetch user profile to persist user_id and email as cookies,
			// used by server-side API endpoints (e.g. prediction history).
			const user = await userApi.getCurrentUser(cookies);
			cookies.set('user_id', String(user.id), { ...cookieOptions, httpOnly: true });
			cookies.set('user_email', user.email, { ...cookieOptions, httpOnly: true });
		} catch {
			return fail(401, { message: 'Invalid email or password' });
		}

		redirect(302, '/dashboard');
	}
};
