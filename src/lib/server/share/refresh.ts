import type { Goal, UserStats } from '$lib/server/trenara/types';
import { goalShareDAO } from '$lib/server/db/goal-share';
import { projectSnapshot } from './snapshot';

/**
 * Keep a shared goal's snapshot current, from data the caller already has.
 *
 * Takes the goal and stats rather than fetching them: both callers are page
 * loads that just fetched them (through the read cache, so a second fetch
 * here would cost nothing extra — but taking them as arguments is what makes
 * this write share the exact same reading of Trenara as whatever else the
 * caller records this request, which is what "One consistency unit" in
 * `.kiro/specs/goal-sharing/design.md` is about).
 *
 * Unthrottled, deliberately: the shared page mixes this snapshot with a live
 * read of `prediction_history`, and a snapshot that lagged behind by a
 * throttle window could anchor a forecast on a prediction the history beside
 * it had already moved past. Every call here is one small `UPDATE` that
 * matches no row for the ordinary runner who has never shared anything.
 *
 * Best-effort in the way `keepHistory` is best-effort — it never rejects, and
 * it must never fail the caller's page. A runner whose share row will not
 * write still gets their dashboard.
 */
export async function refreshShareSnapshot(
	userId: number,
	goal: Goal | null,
	stats: UserStats | null
): Promise<void> {
	if (!goal || !stats) return;

	const snapshot = projectSnapshot(goal, stats);
	if (!snapshot) return;

	try {
		await goalShareDAO.refreshSnapshot(userId, goal.id, snapshot);
	} catch {
		// Side effect of a page load, not the point of it.
	}
}
