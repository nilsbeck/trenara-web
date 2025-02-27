import { authApi } from '$lib/server/api';
import type { AuthResponse, ApiError, LoginRequest } from '$lib/server/api/types';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getSessionTokenCookie, setSessionTokenCookie, TokenType } from '$lib/server/auth'

export const load: PageServerLoad = async (event) => {
	if (!getSessionTokenCookie(event.cookies, TokenType.AccessToken)) {
		return redirect(302, '/login');
	}

	return {};
};

