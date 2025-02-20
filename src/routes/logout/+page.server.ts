import * as auth from '$lib/server/auth';
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	auth.deleteSessionTokenCookie(event.cookies, auth.TokenType.AccessToken);
	auth.deleteSessionTokenCookie(event.cookies, auth.TokenType.RefreshToken);

	return redirect(302, '/login');
};
