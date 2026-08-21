import type { PageServerLoad } from './$types';
import { predictionHistoryDAO } from '$lib/server/db/prediction-history';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		error(401, 'Unauthorized');
	}

	const records = await predictionHistoryDAO.getUserPredictionHistory(locals.user.id);

	return {
		records
	};
};
