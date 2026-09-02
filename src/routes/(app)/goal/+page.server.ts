import { trainingApi, userApi } from '$lib/server/trenara';
import { passthrough, passthroughOptional } from '$lib/server/trenara/request';
import { requireUser } from '$lib/server/auth/guard';
import { keepHistory } from '$lib/server/history/record';
import { predictionHistoryDAO } from '$lib/server/db/prediction-history';
import { goalShareDAO } from '$lib/server/db/goal-share';
import { toChartData } from '$lib/server/history/chart-points';
import { STORAGE_READ_MESSAGE } from '$lib/server/db/errors';
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
	 * The two writes the card used to fire on mount, run from here instead.
	 *
	 * Not awaited on its own — `history` below awaits it, which is what keeps
	 * it reliable on a serverless platform. A promise nothing in the returned
	 * data depends on is not guaranteed to finish once the response has gone
	 * out; see `keepHistory`'s own comment for why this shape, rather than
	 * "fire and forget", is the one that actually runs to completion.
	 */
	const recorded = keepHistory(cookies, user.id).catch(() => {});

	/**
	 * The prediction history, read after `keepHistory` has had its turn — so
	 * a prediction that changed moments ago is already in the row this reads,
	 * the same order the card's own `onMount` used to run in (post, then
	 * reload only if something changed).
	 *
	 * Caught rather than thrown: this chart failing to load must not take the
	 * goal card down with it, which is the same posture the client-fetched
	 * version held before.
	 */
	const history = (async () => {
		await recorded;
		const startDate = (await goal.catch(() => null))?.start_date || undefined;
		try {
			const records = await predictionHistoryDAO.getUserPredictionHistory(user.id, {
				startDate,
				limit: 200
			});
			return { records: toChartData(records), error: null as string | null };
		} catch {
			return { records: [], error: STORAGE_READ_MESSAGE };
		}
	})();

	/**
	 * The runner's own share link for this goal, if they have one — what
	 * seeds the share dialog. Null on any failure to read it: sharing is a
	 * side feature of this page, not a reason to fail the goal card itself.
	 */
	const share = (async () => {
		const current = await goal.catch(() => null);
		if (!current) return null;
		try {
			return await goalShareDAO.getForGoal(user.id, current.id);
		} catch {
			return null;
		}
	})();

	return { goal, userStats, history, share };
};
