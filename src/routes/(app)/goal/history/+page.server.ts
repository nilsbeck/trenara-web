import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { goalHistoryDAO } from '$lib/server/db/goal-history';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		error(401, 'Unauthorized');
	}

	const records = await goalHistoryDAO.getGoalHistory(locals.user.id);
	return { records };
};
