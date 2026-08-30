import type { PageServerLoad } from './$types';
import { goalHistoryDAO } from '$lib/server/db/goal-history';
import { fromStorage } from '$lib/server/db/errors';
import { requireUser } from '$lib/server/auth/guard';

export const load: PageServerLoad = async ({ locals }) => {
	const user = requireUser(locals);

	// This page is the archive, so a database it cannot read has to fail it.
	// Rendering "no goals archived" over an unreadable table is the one answer
	// a history page must never give.
	const records = await fromStorage(() => goalHistoryDAO.getGoalHistory(user.id));
	return { records };
};
