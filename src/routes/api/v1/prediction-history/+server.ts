import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireUser } from '$lib/server/auth/guard';
import { predictionHistoryDAO } from '$lib/server/db/prediction-history';
import { fromStorage, STORAGE_WRITE_MESSAGE } from '$lib/server/db/errors';
import { passthrough } from '$lib/server/trenara/request';
import { recordCurrentPrediction } from '$lib/server/history/record';
import { storageWrites } from '$lib/server/security/rate-limit';

export const GET: RequestHandler = async ({ url, locals }) => {
	const user = requireUser(locals);

	const startDateParam = url.searchParams.get('startDate');
	const startDate =
		startDateParam && /^\d{4}-\d{2}-\d{2}$/.test(startDateParam) ? startDateParam : undefined;

	const rawLimit = url.searchParams.get('limit')
		? Number(url.searchParams.get('limit'))
		: undefined;
	const limit =
		rawLimit && Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 200) : undefined;

	const records = await fromStorage(() =>
		predictionHistoryDAO.getUserPredictionHistory(user.id, { startDate, limit })
	);

	return json({ records });
};

/**
 * Record today's prediction.
 *
 * Takes no body. It used to take the figures themselves — the browser read
 * them off the page and posted them up, and the server stored whatever passed
 * a shape check. That made the runner's own history client-authored, for a
 * record whose entire purpose is to be trusted long after the source data is
 * gone. The authoritative values are one cached call away on this side, so
 * they are read here instead and anything sent is ignored.
 *
 * Still worth keeping as an endpoint, even though the dashboard load now
 * records on its own: the goal card calls it after a change and wants to know
 * whether a new point exists before it redraws the chart.
 */
export const POST: RequestHandler = async ({ cookies, locals }) => {
	const user = requireUser(locals);

	const limit = storageWrites.check(`prediction:${user.id}`);
	if (!limit.allowed) {
		error(429, 'Too many updates. Please slow down.');
	}

	const result = await passthrough(() =>
		fromStorage(() => recordCurrentPrediction(cookies, user.id), STORAGE_WRITE_MESSAGE)
	);

	return json(result);
};
