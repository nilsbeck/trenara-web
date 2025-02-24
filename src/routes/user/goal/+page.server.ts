import { userApi, trainingApi } from '$lib/server/api';
import { redirect } from '@sveltejs/kit';
import { getSessionTokenCookie, TokenType } from '$lib/server/auth';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	if (!getSessionTokenCookie(event.cookies, TokenType.AccessToken)) {
		return redirect(302, '/login');
	}
    
	return {
		goal: trainingApi.getGoal(event.cookies),
		userStats: userApi.getUserStats(event.cookies)
	};
};
