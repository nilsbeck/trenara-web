import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { TokenType } from '$lib/server/auth/types';
import { predictionHistoryDAO } from '$lib/server/db/prediction-history';

export const DELETE: RequestHandler = async ({ request, cookies }) => {
	if (!cookies.get(TokenType.AccessToken)) {
		error(401, 'Unauthorized');
	}

	const userId = Number(cookies.get('user_id'));
	if (!userId) {
		error(401, 'User ID not found');
	}

	const body = await request.json();
	const goalStartDate = body?.goalStartDate;

	if (typeof goalStartDate !== 'string') {
		error(400, 'Missing goalStartDate');
	}

	const deletedCount = await predictionHistoryDAO.deleteHistoricDataBeforeGoal(
		userId,
		goalStartDate
	);
	return json({ deleted: deletedCount });
};
