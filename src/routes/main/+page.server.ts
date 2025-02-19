import * as auth from '$lib/server/auth';
import { userApi } from '$lib/server/api';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

const BASE_URL = 'https://backend-prod.trenara.com';

export const load: PageServerLoad = async (event) => {
	if (!event.locals.user) {
		return redirect(302, '/login');
	}

	const timestamp = new Date().getTime();
	return {
		user: event.locals.user,
		userData: userApi.getCurrentUser(event),
		schedule: userApi.getSchedule(event, Math.floor(timestamp / 1000))
	};
};

export const actions: Actions = {
	logout: async (event) => {
		console.log(event.locals.user);
		if (!event.locals.user) {
			return fail(401);
		}
		auth.deleteSessionTokenCookie(event, auth.TokenType.AccessToken);
		auth.deleteSessionTokenCookie(event, auth.TokenType.RefreshToken);

		return redirect(302, '/login');
	}
};
