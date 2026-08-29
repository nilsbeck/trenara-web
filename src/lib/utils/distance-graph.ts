import type { UserStats } from '$lib/server/trenara/types';

/**
 * One column of a distance graph: what was planned, and what was run.
 *
 * `done` is a number rather than `number | null` because these graphs plot a
 * continuous line through every column — a day with no run is a real zero on
 * that line, not a gap in it. Whether the zero is "nothing scheduled" or
 * "scheduled and missed" is readable from `todo` beside it.
 */
export interface DistancePoint {
	/** Axis tick text: `Mon` on the week graph, `34` on the goal graph. */
	label: string;
	/** Longer form for the tooltip, where there is room for it. */
	fullLabel: string;
	doneKm: number;
	todoKm: number;
	/** The column the runner is standing in — today, or the current week. */
	isCurrent: boolean;
}

/** A whole graph: the columns, their totals, and what the x axis is counting. */
export interface DistanceSeries {
	points: DistancePoint[];
	/** Totals come from the response's own, never the sum of the columns — see `readGoalDistance`. */
	totalDoneKm: number;
	totalTodoKm: number;
	/** Axis caption, e.g. `Day of week`. */
	axisLabel: string;
	/** Unit the values are in, as the API named it. */
	unit: string;
}

const EMPTY = (axisLabel: string): DistanceSeries => ({
	points: [],
	totalDoneKm: 0,
	totalTodoKm: 0,
	axisLabel,
	unit: 'km'
});

/**
 * The current week, day by day.
 *
 * Reads `graph_stats.weeks`, which carries one row per day Monday–Sunday with
 * planned and completed distance on each — so the week's shape is available
 * from the stats call the dashboard already makes, without touching a schedule.
 *
 * A rest day sends `todo_value: null` rather than `0`, and a day not yet run
 * sends `done_value: null`. Both become `0` here: the graph draws a line
 * through every day of the week, and a rest day is genuinely zero distance.
 */
export function readWeekDistance(
	weeks: UserStats['graph_stats']['weeks'] | null | undefined
): DistanceSeries {
	const rows = weeks?.data ?? [];
	if (rows.length === 0) return EMPTY('Day of week');

	const ordered = [...rows].sort((a, b) => a.order - b.order);

	return {
		points: ordered.map((r) => ({
			label: shortDay(r.day),
			fullLabel: r.day,
			doneKm: r.done_value ?? 0,
			todoKm: r.todo_value ?? 0,
			isCurrent: r.is_today
		})),
		totalDoneKm: weeks?.done_value ?? 0,
		totalTodoKm: weeks?.todo_value ?? 0,
		axisLabel: 'Day of week',
		unit: weeks?.todo_unit ?? weeks?.done_unit ?? 'km'
	};
}

/**
 * The whole goal, week by week.
 *
 * Reads `graph_stats.goal` — the same series `plan-weeks.ts` classifies, read
 * here for volume alone.
 *
 * Totals are the response's stated ones rather than the sum of the rows, and
 * the two do not always agree: the series can begin after the goal does, so a
 * goal's first week may have no row at all while its distance still counts
 * toward the total. Summing the rows would quietly under-report the plan.
 */
export function readGoalDistance(
	goal: UserStats['graph_stats']['goal'] | null | undefined
): DistanceSeries {
	const rows = goal?.data ?? [];
	if (rows.length === 0) return EMPTY('Week number');

	const ordered = [...rows].sort((a, b) => a.order - b.order);

	return {
		points: ordered.map((r) => ({
			label: String(r.week),
			fullLabel: `Week ${r.week}${r.month ? ` · ${r.month}` : ''}`,
			doneKm: r.done_value ?? 0,
			todoKm: r.todo_value ?? 0,
			isCurrent: r.is_current_week
		})),
		totalDoneKm: goal?.done_value ?? 0,
		totalTodoKm: goal?.todo_value ?? 0,
		axisLabel: 'Week number',
		unit: goal?.todo_unit ?? goal?.done_unit ?? 'km'
	};
}

/**
 * `Monday` → `Mon`, and leave anything already short alone.
 *
 * The API has been seen to send both the full weekday and the abbreviation
 * depending on locale, and the axis has room for three characters either way.
 */
function shortDay(day: string): string {
	return day.length > 3 ? day.slice(0, 3) : day;
}

/** Distance for display: `8 km`, `8.4 km`, `159.7 km`. */
export function formatKm(value: number, unit = 'km'): string {
	return `${formatDistanceValue(value)} ${unit}`;
}

/**
 * The bare number, rounded as `formatKm` rounds it — for the places that
 * carry the unit once for a pair of values rather than on each of them.
 */
export function formatDistanceValue(value: number): string {
	const rounded = Math.round(value * 10) / 10;
	return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}
