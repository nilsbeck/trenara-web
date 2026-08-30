import type { PageServerLoad } from './$types';
import { predictionHistoryDAO } from '$lib/server/db/prediction-history';
import { fromStorage } from '$lib/server/db/errors';
import { requireUser } from '$lib/server/auth/guard';

export const load: PageServerLoad = async ({ locals }) => {
	const user = requireUser(locals);

	// Rows written before the API's 10K figure was recorded get their equivalent
	// filled in here, so this page has a full series to plot rather than four
	// points. Idempotent, so it costs one empty query once it has caught up, and
	// best-effort: a failure leaves the older rows unconverted rather than
	// failing the page.
	await predictionHistoryDAO.backfillDerivedTenK(user.id).catch(() => 0);

	const records = await fromStorage(() => predictionHistoryDAO.getUserPredictionHistory(user.id));

	return {
		records
	};
};
