import { predictionHistoryDAO } from '$lib/server/db/prediction-history';
import { goalShareDAO, type ShareRow } from '$lib/server/db/goal-share';
import { STORAGE_READ_MESSAGE } from '$lib/server/db/errors';
import type { Goal, UserStats } from '$lib/server/trenara/types';
import type { ChartDataPoint } from '$lib/components/charts/prediction-chart.svelte';
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
 * Neither throws: a failure in either is something the card shows inline,
 * not a reason to fail the page.
 */

export interface GoalChart {
	records: ChartDataPoint[];
	error: string | null;
}

/** The prediction series since the goal began, with today's reading on the end. */
export async function readGoalChart(
	userId: number,
	goal: Goal | null,
	stats: UserStats | null,
	now = new Date()
): Promise<GoalChart> {
	try {
		// Bounded by the limit (§7, Storage): at most a row a day, and only on change.
		const records = await predictionHistoryDAO.getUserPredictionHistory(userId, {
			startDate: goal?.start_date || undefined,
			limit: 200
		});
		return {
			records: withCurrentReading(toChartData(records), stats, utcDay(now)),
			error: null
		};
	} catch {
		return { records: [], error: STORAGE_READ_MESSAGE };
	}
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
	goal: Goal | null
): Promise<Pick<ShareRow, 'token' | 'title'> | null> {
	if (!goal) return null;
	try {
		const row = await goalShareDAO.getForGoal(userId, goal.id);
		return row ? { token: row.token, title: row.title } : null;
	} catch {
		return null;
	}
}
