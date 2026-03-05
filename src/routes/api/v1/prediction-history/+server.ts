import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { TokenType } from '$lib/server/auth/types';
import { predictionHistoryDAO } from '$lib/server/db/prediction-history';
import { predictionHistoryQuerySchema, predictionRecordSchema } from '$lib/schemas/prediction';

export const GET: RequestHandler = async ({ url, cookies }) => {
	if (!cookies.get(TokenType.AccessToken)) {
		error(401, 'Unauthorized');
	}

	const userId = Number(cookies.get('user_id'));
	if (!userId) {
		error(401, 'User ID not found');
	}

	const startDate = url.searchParams.get('startDate') ?? undefined;
	const limit = url.searchParams.get('limit')
		? Number(url.searchParams.get('limit'))
		: undefined;

	const records = await predictionHistoryDAO.getUserPredictionHistory(userId, {
		startDate,
		limit
	});

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
	const result = predictionRecordSchema.safeParse(body);

	if (!result.success) {
		error(400, result.error.issues[0].message);
	}

	const { time, pace } = result.data;
	const storeResult = await predictionHistoryDAO.storeIfChanged(userId, time, pace);
	return json(storeResult);
};
