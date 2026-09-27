import { trainingApi, userApi } from '$lib/server/trenara';
import { passthrough, passthroughOptional } from '$lib/server/trenara/request';
import { requireUser } from '$lib/server/auth/guard';
import { keepHistory } from '$lib/server/history/record';
import { readGoalChart, readGoalShare } from '$lib/server/history/goal-card-data';
import { afterResponse } from '$lib/server/after-response';
import type { PageServerLoad } from './$types';

/**
 * The goal card and the predictions table, streamed.
 *
 * `goal` and `userStats` go through `passthrough`, which every other route has
 * had since the connection work and this one did not: without it a refusal
 * arrives as whatever Trenara worded it as, or as nothing at all, and the page
 * had no way to tell a rate limit from an outage from an expired session. They
 * are the whole of this page, so a failure is allowed to fail it — but it has
 * to fail it with a reason attached.
 *
 * The goal itself is read as optional. Deleting a goal in Trenara makes
 * `/api/goal` answer 404 `{"message":"No result found"}`, and relaying that
 * faithfully put "No result found" on the page in error red, under a "Try
 * again" button that could only ever produce the same 404 — a normal, chosen
 * state of the account reported as a fault. `passthroughOptional` turns that
 * one status into `null` for the page to render an empty state from, and
 * leaves every other failure exactly as it was.
 *
 * `history` and `share` are new. Both used to be the goal card's own concern —
 * fetched from `onMount`, alongside two writes the card fired at the same
 * time (record today's prediction, archive the current goal). All of that
 * moved here: §5 of `agents.md` rules out `onMount` for data a `load` can
 * already hold, and the goal card is a pure function of its props now — see
 * "Reusing the goal card" in `.kiro/specs/goal-sharing/design.md`. `history`
 * and `share` never throw; a failure in either is a fact this page renders
 * rather than one that fails it, matching what the card showed inline before.
 */
export const load: PageServerLoad = async ({ cookies, locals }) => {
	const user = requireUser(locals);

	const goal = passthroughOptional(() => trainingApi.getGoal(cookies));
	const userStats = passthrough(() => userApi.getUserStats(cookies));

	/**
	 * The two writes the card used to fire on mount, run from here instead —
	 * and finished after the response rather than before the chart. The
	 * history read used to wait for them so a prediction that changed moments
	 * ago was already in the rows; it lays today's reading over the rows from
	 * the stats instead (`readGoalChart`), and `afterResponse` keeps the
	 * function alive until the writes are done. See `keepHistory`.
	 */
	afterResponse(keepHistory(cookies, user.id));

	const currentGoal = goal.catch(() => null);
	const currentStats = userStats.catch(() => null);

	/**
	 * The prediction history, and the runner's own share link for this goal —
	 * what seeds the share dialog. Neither throws: this chart failing to load
	 * must not take the goal card down with it, and sharing is a side feature
	 * of this page, not a reason to fail it.
	 */
	const history = Promise.all([currentGoal, currentStats]).then(([g, s]) =>
		readGoalChart(user.id, g, s)
	);
	const share = currentGoal.then((g) => readGoalShare(user.id, g));

	return { goal, userStats, history, share };
};
