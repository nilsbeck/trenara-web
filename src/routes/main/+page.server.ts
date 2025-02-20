import { userApi } from '$lib/server/api';
import { redirect } from '@sveltejs/kit';
import { getSessionTokenCookie, TokenType } from '$lib/server/auth';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	if (!getSessionTokenCookie(event.cookies, TokenType.AccessToken)) {
		return redirect(302, '/login');
	}

	const timestamp = new Date().getTime();
	return {
		user: event.cookies.get('user'),
		// userData: userApi.getCurrentUser(event.cookies),
		schedule: userApi.getSchedule(event.cookies, Math.floor(timestamp / 1000))
	};
};

