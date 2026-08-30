import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireUser } from '$lib/server/auth/guard';
import { goalHistoryDAO } from '$lib/server/db/goal-history';
import { fromStorage, STORAGE_WRITE_MESSAGE } from '$lib/server/db/errors';
import { passthrough } from '$lib/server/trenara/request';
import { archiveCurrentGoal } from '$lib/server/history/record';
import { storageWrites } from '$lib/server/security/rate-limit';

export const GET: RequestHandler = async ({ locals }) => {
	const user = requireUser(locals);
	const records = await fromStorage(() => goalHistoryDAO.getGoalHistory(user.id));
	return json({ records });
};

/**
 * Archive the goal that is current right now.
 *
 * Takes no body, for the reasons in `$lib/server/history/record`. It also
 * closes the shape this endpoint used to have: `goal_name` was a free string
 * and part of the table's uniqueness constraint, so an account could write as
 * many rows as it cared to invent names for. Derived from `/api/goal`, a
 * runner has exactly as many archivable goals as Trenara has given them.
 */
export const POST: RequestHandler = async ({ cookies, locals }) => {
	const user = requireUser(locals);

	const limit = storageWrites.check(`goal-archive:${user.id}`);
	if (!limit.allowed) {
		error(429, 'Too many updates. Please slow down.');
	}

	const result = await passthrough(() =>
		fromStorage(() => archiveCurrentGoal(cookies, user.id), STORAGE_WRITE_MESSAGE)
	);

	return json(result);
};
