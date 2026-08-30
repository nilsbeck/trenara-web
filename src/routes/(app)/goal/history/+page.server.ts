import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { goalHistoryDAO } from '$lib/server/db/goal-history';
import { fromStorage } from '$lib/server/db/errors';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		error(401, 'Unauthorized');
	}

	// This page is the archive, so a database it cannot read has to fail it.
	// Rendering "no goals archived" over an unreadable table is the one answer
	// a history page must never give.
	const records = await fromStorage(() => goalHistoryDAO.getGoalHistory(locals.user!.id));
	return { records };
};
