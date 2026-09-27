import type { PredictionRecord } from '$lib/server/db/prediction-history';
import type { UserStats } from '$lib/server/trenara/types';
import type { ChartDataPoint } from '$lib/components/charts/prediction-chart.svelte';
import { timeStringToSeconds, paceStringToSeconds } from '$lib/utils/format';

/**
 * Stored prediction rows, as the goal card's chart wants them.
 *
 * This used to run in the browser, inside `goal-card.svelte`, once the card
 * fetched its own history over `fetch`. Both callers of the card now read
 * the rows server-side and hand the card a resolved `history` prop instead —
 * see "Reusing the goal card" in `.kiro/specs/goal-sharing/design.md` — so the
 * conversion moved here, where it is shared rather than duplicated between
 * `/goal`'s load and the shared page's.
 *
 * A row whose stored time or pace does not parse is dropped rather than
 * thrown on: one bad row from a database written by more than one shape of
 * this app over time must not blank the whole chart.
 */
export function toChartData(records: PredictionRecord[]): ChartDataPoint[] {
	return records
		.map((r) => {
			try {
				return {
					date: r.recorded_at,
					predictedTime: timeStringToSeconds(r.predicted_time),
					predictedPace: paceStringToSeconds(r.predicted_pace),
					formattedTime: r.predicted_time,
					formattedPace: r.predicted_pace
				};
			} catch {
				return null;
			}
		})
		.filter((d): d is ChartDataPoint => d !== null);
}

/** Trenara returns paces as `5:20 min/km`; the tables store the figure alone. */
export function stripPaceUnit(pace: string | undefined | null): string | null {
	if (!pace) return null;
	const bare = pace.replace(/\s*min\/(km|mi)\s*/i, '').trim();
	return bare || null;
}

/**
 * The storage day `prediction_history` buckets a reading under.
 *
 * Deliberately the UTC day, unlike every calendar date in the app — see the
 * matching comment in `PredictionHistoryDAO.storeIfChanged`, which this has to
 * agree with, and §8 of `agents.md`.
 */
export function utcDay(now: Date): string {
	// eslint-disable-next-line no-restricted-syntax -- the UTC storage bucket, as above
	return now.toISOString().slice(0, 10);
}

/**
 * The stored series, with today's reading as Trenara reports it right now.
 *
 * The page loads used to read the history only after `keepHistory` had
 * written today's row, so the chart included it — and so every dashboard
 * paint waited on that write: two Trenara reads and then a chain of database
 * round trips, none of which the page needed to draw anything. The write now
 * finishes after the response (`afterResponse`), and the read runs beside the
 * schedule instead of after the write. What the write would have added is
 * already in hand, in `stats`, so it is laid over the rows here rather than
 * read back.
 *
 * Mirrors what `storeIfChanged` does to the plotted values: a reading equal to
 * the latest point adds nothing; one that differs replaces today's point if
 * there is one, and is appended otherwise. (The DAO can also write a row when
 * only a secondary distance moved; that row plots the same time and pace as
 * the one before it, so leaving it out here draws the same line.)
 */
export function withCurrentReading(
	points: ChartDataPoint[],
	stats: UserStats | null,
	today: string
): ChartDataPoint[] {
	const time = stats?.best_times?.time_for_goal;
	const pace = stripPaceUnit(stats?.best_times?.pace_for_goal);
	if (!time || !pace) return points;

	const predictedTime = timeStringToSeconds(time);
	const predictedPace = paceStringToSeconds(pace);
	// The same guard as `toChartData`: a reading that does not parse is not drawn.
	if (!predictedTime || !predictedPace) return points;

	const last = points.at(-1);
	if (last && last.formattedTime === time && last.formattedPace === pace) return points;

	const current: ChartDataPoint = {
		date: today,
		predictedTime,
		predictedPace,
		formattedTime: time,
		formattedPace: pace
	};

	return last?.date === today ? [...points.slice(0, -1), current] : [...points, current];
}
