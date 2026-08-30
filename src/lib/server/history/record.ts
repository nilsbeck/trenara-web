import type { Cookies } from '@sveltejs/kit';
import { trainingApi, userApi } from '$lib/server/trenara';
import { goalHistoryDAO } from '$lib/server/db/goal-history';
import { predictionHistoryDAO } from '$lib/server/db/prediction-history';

/**
 * Writing the runner's history from what Trenara says, not from what a browser
 * sends.
 *
 * Two problems met here, and they turned out to be the same problem.
 *
 * The values used to be composed in `goal-card.svelte` and posted up: the
 * server validated their *shape* with Zod and stored whatever arrived. So the
 * goal archive — a record meant to be trusted years later, after the goal it
 * describes is gone from the API — was authored by the client, and a runner
 * could rewrite their own past by hand. The server had the authoritative
 * source the whole time: `getUserStats` and `getGoal` are one cached call away.
 *
 * And because the recording lived in a component, it only happened when
 * somebody opened the page it was on. Nobody looks at the goal card for a
 * fortnight and the series has a fortnight-shaped hole in it, permanently —
 * the API only ever returns today's prediction, so a day not written down is a
 * day gone. Reading the source server-side means it can also be recorded from
 * the loads that already hold it.
 *
 * Both are best-effort by design: this is a side record, and failing to write
 * it must never fail the page that triggered it.
 */

/** Trenara returns paces as `5:20 min/km`; the tables store the figure alone. */
function stripPaceUnit(pace: string | undefined | null): string | null {
	if (!pace) return null;
	const bare = pace.replace(/\s*min\/(km|mi)\s*/i, '').trim();
	return bare || null;
}

export interface RecordResult {
	stored: boolean;
}

/**
 * Record today's predictions, as Trenara currently reports them.
 *
 * Idempotent: `prediction_history` is unique on `(user_id, recorded_at)` and
 * the DAO only writes when something changed, so calling this on every
 * dashboard load costs one query and produces at most one row a day.
 */
export async function recordCurrentPrediction(
	cookies: Cookies,
	userId: number
): Promise<RecordResult> {
	const stats = await userApi.getUserStats(cookies);
	const best = stats?.best_times;

	const time = best?.time_for_goal;
	const pace = stripPaceUnit(best?.pace_for_goal);
	if (!time || !pace) return { stored: false };

	const time10k = best?.time_for_10;
	const pace10k = stripPaceUnit(best?.pace_for_10);

	const result = await predictionHistoryDAO.storeIfChanged(
		userId,
		time,
		pace,
		time10k && pace10k ? { time: time10k, pace: pace10k } : null,
		{
			time5k: best?.time_for_5,
			timeHalf: best?.time_for_half_marathon,
			timeMarathon: best?.time_for_marathon
		}
	);

	return { stored: result.stored };
}

/**
 * Archive the goal that is current right now.
 *
 * Runs for active goals too, not only finished ones: `/api/goal` only ever
 * returns the goal in force today, so a goal replaced before anyone looked
 * would otherwise be lost for good. The table upserts on
 * `(user_id, goal_name, end_date)`, so repeat calls refresh the stored final
 * prediction rather than piling up rows.
 */
export async function archiveCurrentGoal(cookies: Cookies, userId: number): Promise<RecordResult> {
	const [goal, stats] = await Promise.all([
		trainingApi.getGoal(cookies),
		userApi.getUserStats(cookies).catch(() => null)
	]);

	if (!goal?.name || !goal.start_date || !goal.end_date) return { stored: false };

	const goalPace = stripPaceUnit(goal.pace);
	if (!goal.time || !goalPace) return { stored: false };

	const result = await goalHistoryDAO.archiveGoal(userId, {
		goal_name: goal.name,
		distance: goal.distance,
		goal_time: goal.time,
		goal_pace: goalPace,
		final_predicted_time: stats?.best_times?.time_for_goal ?? null,
		final_predicted_pace: stripPaceUnit(stats?.best_times?.pace_for_goal),
		start_date: goal.start_date,
		end_date: goal.end_date
	});

	return { stored: result.stored };
}

/**
 * Both of the above, for a page load that wants the record kept up to date.
 *
 * Never rejects: a history write is a side effect of looking at the app, and a
 * page must not fail because one did.
 *
 * Awaited by its caller rather than fired and forgotten. A promise left running
 * after the response is sent is not guaranteed to finish on a serverless
 * platform — the function can be frozen the moment it has answered — so
 * "fire and forget" here would mean "sometimes forget". Run alongside the
 * calls the page is already making, it costs no wall-clock time: the upstream
 * reads it needs are the same cached ones the load has in hand, and the
 * database round trips finish long before six weeks of schedule do.
 */
export async function keepHistory(cookies: Cookies, userId: number): Promise<void> {
	await Promise.allSettled([
		recordCurrentPrediction(cookies, userId),
		archiveCurrentGoal(cookies, userId)
	]);
}
