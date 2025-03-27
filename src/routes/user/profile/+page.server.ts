import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getSessionTokenCookie, TokenType } from '$lib/server/auth'

export const load: PageServerLoad = async (event) => {
	if (!getSessionTokenCookie(event.cookies, TokenType.AccessToken)) {
		return redirect(302, '/login');
	}

	return {};
};

