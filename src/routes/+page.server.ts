import * as auth from '$lib/server/auth';
import { userApi } from '$lib/server/api';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';


export const load: PageServerLoad = async (event) => {
	if (!event.locals.user) {
		return redirect(302, '/login');
	}

    try {

        const userData = await userApi.getCurrentUser(event)
		const timestamp = new Date().getTime()
		const schedule = await userApi.getSchedule(event, Math.floor(timestamp / 1000))
        return { user: event.locals.user, userData: userData, schedule: schedule };
    } catch (error) {
        console.error(error)
    }
};

export const actions: Actions = {
	logout: async (event) => {
		if (!event.locals.session) {
			return fail(401);
		}
		auth.deleteSessionTokenCookie(event, auth.TokenType.AccessToken);
		auth.deleteSessionTokenCookie(event, auth.TokenType.RefreshToken);

		return redirect(302, '/login');
	},
};
