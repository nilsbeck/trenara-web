import { error } from '@sveltejs/kit';
import { trainingApi, userApi } from '$lib/server/trenara';
import { passthrough } from '$lib/server/trenara/request';
import type { PageServerLoad } from './$types';

/**
 * The goal card and the predictions table, streamed.
 *
 * Both go through `passthrough`, which every other route has had since the
 * connection work and this one did not: without it a refusal arrives as
 * whatever Trenara worded it as, or as nothing at all, and the page had no way
 * to tell a rate limit from an outage from an expired session. They are the
 * whole of this page, so a failure is allowed to fail it — but it has to fail
 * it with a reason attached.
 */
export const load: PageServerLoad = async ({ cookies, locals }) => {
	if (!locals.user) {
		error(401, 'Unauthorized');
	}

	return {
		goal: passthrough(() => trainingApi.getGoal(cookies)),
		userStats: passthrough(() => userApi.getUserStats(cookies))
	};
};
