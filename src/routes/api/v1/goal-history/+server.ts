import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { goalHistoryDAO } from '$lib/server/db/goal-history';
import { archiveGoalSchema } from '$lib/schemas/goal-history';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) {
		error(401, 'Unauthorized');
	}

	const records = await goalHistoryDAO.getGoalHistory(locals.user.id);
	return json({ records });
};

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		error(401, 'Unauthorized');
	}

	const body = await request.json();
	const result = archiveGoalSchema.safeParse(body);

	if (!result.success) {
		error(400, result.error.issues[0]?.message ?? 'Invalid request body');
	}

	const {
		goal_name,
		distance,
		goal_time,
		goal_pace,
		final_predicted_time,
		final_predicted_pace,
		start_date,
		end_date
	} = result.data;

	const record = await goalHistoryDAO.archiveGoal(locals.user.id, {
		goal_name,
		distance,
		goal_time,
		goal_pace,
		final_predicted_time: final_predicted_time ?? null,
		final_predicted_pace: final_predicted_pace ?? null,
		start_date,
		end_date
	});

	return json(record);
};
