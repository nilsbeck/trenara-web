import { authApi } from '$lib/server/api';
import type { AuthResponse, ApiError, LoginRequest } from '$lib/server/api/types';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getSessionTokenCookie, setSessionTokenCookie, TokenType } from '$lib/server/auth'

export const load: PageServerLoad = async (event) => {
	if (getSessionTokenCookie(event.cookies, TokenType.AccessToken)) {
		return redirect(302, '/user');
	}
	return;
};


export const actions: Actions = {
	login: async ({ cookies, request }) => {
		const formData = await request.formData();
		const username = decodeURIComponent(formData.get('username')!.toString());
		const password = decodeURIComponent(formData.get('password')!.toString());

		if (username == "" || password == "") {
			return fail(400, { message: 'Empty username or password' });
		}

		try {
			const data: LoginRequest = {
				username: username!.toString(),
				password: password!.toString()
			};
		  
			const response: AuthResponse = await authApi.login(data);

			const currentDate = new Date();
			const expirationDate = new Date(currentDate.getTime() + response.expires_in * 1000);
			setSessionTokenCookie(cookies, response.access_token, TokenType.AccessToken, expirationDate)
			setSessionTokenCookie(cookies, response.refresh_token, TokenType.RefreshToken, expirationDate)
		} catch (error) {
			// Handle API errors
			const apiError = error as ApiError;
			if (apiError.status === 401) {
			  console.error('Invalid credentials');
			} else {
			  console.error('Login failed:', apiError.status);
			  // If there are field-specific errors, they'll be in apiError.errors
			  if (apiError.errors) {
				console.error('Validation errors:', apiError.errors);
			  }
			}
		  }

		return redirect(302, '/user');
	},
};

