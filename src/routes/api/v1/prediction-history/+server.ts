import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { predictionHistoryDAO } from '$lib/server/db/prediction-history';
import { predictionRecordSchema } from '$lib/schemas/prediction';

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) {
		error(401, 'Unauthorized');
	}

	const startDateParam = url.searchParams.get('startDate');
	const startDate = startDateParam && /^\d{4}-\d{2}-\d{2}$/.test(startDateParam)
		? startDateParam
		: undefined;

	const rawLimit = url.searchParams.get('limit') ? Number(url.searchParams.get('limit')) : undefined;
	const limit = rawLimit && Number.isFinite(rawLimit) && rawLimit > 0
		? Math.min(rawLimit, 200)
		: undefined;

	const records = await predictionHistoryDAO.getUserPredictionHistory(locals.user.id, {
		startDate,
		limit
	});

	return json({ records });
};

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		error(401, 'Unauthorized');
	}

	const body = await request.json();
	const result = predictionRecordSchema.safeParse(body);

	if (!result.success) {
		error(400, 'Invalid request body');
	}

	const { time, pace } = result.data;
	const storeResult = await predictionHistoryDAO.storeIfChanged(locals.user.id, time, pace);
	return json(storeResult);
};
