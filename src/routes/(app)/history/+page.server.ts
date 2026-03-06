import type { PageServerLoad } from './$types';
import { TokenType } from '$lib/server/auth/types';
import { predictionHistoryDAO } from '$lib/server/db/prediction-history';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ cookies }) => {
	if (!cookies.get(TokenType.AccessToken)) {
		error(401, 'Unauthorized');
	}

	const userId = Number(cookies.get('user_id'));
	if (!userId) {
		error(401, 'User ID not found');
	}

	const records = await predictionHistoryDAO.getUserPredictionHistory(userId);

	return {
		records
	};
};
