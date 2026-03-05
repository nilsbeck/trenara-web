import { trainingApi, userApi } from '$lib/server/trenara';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies }) => {
	return {
		goal: trainingApi.getGoal(cookies),
		userStats: userApi.getUserStats(cookies)
	};
};
