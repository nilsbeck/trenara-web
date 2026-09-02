import type { PredictionRecord } from '$lib/server/db/prediction-history';
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
