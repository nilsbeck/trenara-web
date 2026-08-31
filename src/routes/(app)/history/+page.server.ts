import type { PageServerLoad } from './$types';
import { predictionHistoryDAO } from '$lib/server/db/prediction-history';
import { fromStorage } from '$lib/server/db/errors';
import { requireUser } from '$lib/server/auth/guard';

export const load: PageServerLoad = async ({ locals }) => {
	const user = requireUser(locals);

	// Rows written before the Riegel curve was stored get it fitted here — and
	// with it the 10K equivalent for the rows the API never gave one, so this
	// page has a full series to plot rather than four points. Idempotent, so it
	// costs one empty query once it has caught up, and best-effort: a failure
	// leaves the older rows unconverted rather than failing the page.
	await predictionHistoryDAO.backfillRiegelCurve(user.id).catch(() => 0);

	const records = await fromStorage(() => predictionHistoryDAO.getUserPredictionHistory(user.id));

	return {
		records
	};
};
