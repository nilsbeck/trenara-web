import { predictionHistoryDAO } from '#lib/server/db/prediction-history.js';
import { goalShareDAO, type ShareRow } from '#lib/server/db/goal-share.js';
import { STORAGE_READ_MESSAGE } from '#lib/server/db/errors.js';
import type { Goal, UserStats } from '#lib/server/trenara/types.js';
import type { ChartDataPoint } from '#lib/components/charts/prediction-chart.svelte';
import { toChartData, utcDay, withCurrentReading } from './chart-points';

/**
 * The two database reads behind the goal card, shared by `/dashboard` and
 * `/goal` so the card reads the same wherever it is stacked.
 *
 * Neither waits for `keepHistory` any more. Both loads used to read the chart
 * only after the history write had landed, which put two Trenara reads and a
 * chain of database round trips on the page's critical path; the write now
 * runs after the response (`afterResponse`) and today's reading is laid over
 * the stored rows from the stats the page already holds.
 *
 * Nor do they wait for the goal. Each needs something from it — the chart its
 * start date, the share link its id — and each used to be asked for once the
 * goal had answered, so a page waited for Trenara's goal read and then for a
 * database round trip after it: 220 ms and then 140 on the first measured
 * preview load, with `keepHistory`'s writes leaving at the same moment and
 * queueing beside them. Both are asked for by the runner's id now, the moment
 * they are called, and the goal only decides which rows to keep. So the goal
 * and the stats are taken as promises: the caller hands over what it is
 * waiting for rather than waiting for it first.
 *
 * Neither throws: a failure in either is something the card shows inline,
 * not a reason to fail the page.
 */

type Awaitable<T> = T | PromiseLike<T>;

/** Bounded by the limit (§7, Storage): at most a row a day, and only on change. */
const CHART_ROWS = 200;

export interface GoalChart {
	records: ChartDataPoint[];
	error: string | null;
}

/** A goal or stats read the card can do without: a failure is the same as none. */
function orNull<T>(value: Awaitable<T | null>): Promise<T | null> {
	return Promise.resolve(value).catch(() => null);
}

/**
 * The prediction series since the goal began, with today's reading on the end.
 *
 * The newest rows rather than the oldest when there are more than the limit:
 * the series ends at today's reading, and a goal past its two-hundredth
 * recorded day would otherwise stop short of it and leave a gap before the
 * last point. Rows from before the goal began — an earlier goal's — are
 * dropped here rather than by the query, which is what lets the query leave
 * before the goal has answered. Both dates are plain `YYYY-MM-DD` (a `DATE`
 * column; `/api/goal`'s `start_date`), so they compare as strings.
 */
export async function readGoalChart(
	userId: number,
	goal: Awaitable<Goal | null>,
	stats: Awaitable<UserStats | null>,
	now = new Date()
): Promise<GoalChart> {
	const rows = predictionHistoryDAO
		.getUserPredictionHistory(userId, { limit: CHART_ROWS, newestFirst: true })
		.catch(() => null);

	const [records, currentGoal, currentStats] = await Promise.all([
		rows,
		orNull(goal),
		orNull(stats)
	]);
	if (!records) return { records: [], error: STORAGE_READ_MESSAGE };

	const since = currentGoal?.start_date;
	const kept = since ? records.filter((r) => r.recorded_at >= since) : records;
	return {
		records: withCurrentReading(toChartData(kept), currentStats, utcDay(now)),
		error: null
	};
}

/**
 * The runner's own live share link for this goal, if they have one.
 *
 * The two fields the share button renders, not the row: a load's return value
 * is serialised into the page's HTML (§3), and the row carries the owner's id
 * and the stored snapshot.
 */
export async function readGoalShare(
	userId: number,
	goal: Awaitable<Goal | null>
): Promise<Pick<ShareRow, 'token' | 'title'> | null> {
	const links = goalShareDAO.listLive(userId).catch(() => null);

	const [live, currentGoal] = await Promise.all([links, orNull(goal)]);
	const link = currentGoal && live?.find((row) => row.goal_id === currentGoal.id);
	return link ? { token: link.token, title: link.title } : null;
}
