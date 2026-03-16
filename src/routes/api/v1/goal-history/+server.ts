import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { TokenType } from '$lib/server/auth/types';
import { goalHistoryDAO } from '$lib/server/db/goal-history';

export const GET: RequestHandler = async ({ cookies }) => {
	if (!cookies.get(TokenType.AccessToken)) {
		error(401, 'Unauthorized');
	}

	const userId = Number(cookies.get('user_id'));
	if (!userId) {
		error(401, 'User ID not found');
	}

	const records = await goalHistoryDAO.getGoalHistory(userId);
	return json({ records });
};

export const POST: RequestHandler = async ({ request, cookies }) => {
	if (!cookies.get(TokenType.AccessToken)) {
		error(401, 'Unauthorized');
	}

	const userId = Number(cookies.get('user_id'));
	if (!userId) {
		error(401, 'User ID not found');
	}

	const body = await request.json();

	const { goal_name, distance, goal_time, goal_pace, final_predicted_time, final_predicted_pace, start_date, end_date } = body;

	if (!goal_name || !distance || !goal_time || !goal_pace || !start_date || !end_date) {
		error(400, 'Missing required fields');
	}

	const result = await goalHistoryDAO.archiveGoal(userId, {
		goal_name,
		distance,
		goal_time,
		goal_pace,
		final_predicted_time: final_predicted_time ?? null,
		final_predicted_pace: final_predicted_pace ?? null,
		start_date,
		end_date
	});

	return json(result);
};
