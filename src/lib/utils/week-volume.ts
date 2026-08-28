import type { UserStats } from '$lib/server/trenara/types';
import { toLocalDateString } from './date';

/**
 * This week's running volume: what was asked, what is run, and what is still
 * within reach.
 *
 * `reachableKm` is the ceiling the week can still finish on — everything
 * already run plus everything still ahead. It equals `plannedKm` on a week
 * that is on track, and drops below it the moment a planned day goes by
 * unrun: those kilometres are gone, and no amount of running on Sunday puts
 * them back. The gap between the two is the week's shortfall.
 */
export interface WeekVolume {
	doneKm: number;
	plannedKm: number;
	/** Done plus everything from today on — the most this week can still total. */
	reachableKm: number;
	/** As the API named it, so a miles account is not silently labelled km. */
	unit: string;
}

type WeekSeries = UserStats['graph_stats']['weeks'];
type DayRow = WeekSeries['data'][number];

/**
 * Read this week's volume out of the stats call the app already makes.
 *
 * `graph_stats.weeks` carries one row per day Monday–Sunday with planned and
 * completed distance on each, plus the week's own totals. The totals are
 * authoritative — summing the rows here would disagree with the same numbers
 * on the graph, which reads the totals for the reasons documented in
 * `distance-graph.ts`. The rows are only used to split the plan into what is
 * behind the runner and what is still ahead.
 */
export function readWeekVolume(
	weeks: WeekSeries | null | undefined,
	today: Date = new Date()
): WeekVolume {
	const doneKm = weeks?.done_value ?? 0;
	const plannedKm = weeks?.todo_value ?? 0;

	return {
		doneKm,
		plannedKm,
		reachableKm: reachableFrom(weeks?.data ?? [], doneKm, plannedKm, today),
		unit: weeks?.todo_unit ?? weeks?.done_unit ?? 'km'
	};
}

/**
 * The most this week can still total: everything run so far plus every
 * planned kilometre from today on.
 *
 * Today counts as ahead — a session scheduled for this morning is still
 * runnable this evening, and marking it lost before the day is out would be
 * both wrong and discouraging.
 *
 * When the rows do not say where today falls the ceiling is `max(done,
 * planned)`, which reports no shortfall at all: a bar claiming kilometres are
 * unreachable had better be sure of it.
 */
function reachableFrom(rows: DayRow[], doneKm: number, plannedKm: number, today: Date): number {
	const ordered = [...rows].sort((a, b) => a.order - b.order);
	const boundary = firstDayAhead(ordered, today);
	if (boundary === null) return Math.max(doneKm, plannedKm);

	const stillAhead = ordered
		.slice(boundary)
		.reduce((total, row) => total + (row.todo_value ?? 0), 0);

	return doneKm + stillAhead;
}

/**
 * Index of the first row the runner has not passed yet, or null when the
 * series does not say.
 *
 * The dates decide it where they are usable, so a tab left open overnight
 * moves the boundary on with the day. `is_today` is the fallback for a series
 * whose dates are missing or unparseable, and a week that carries neither —
 * stale data, or a series for a week that is not this one — gets no answer
 * rather than a guessed one.
 */
function firstDayAhead(ordered: DayRow[], today: Date): number | null {
	const todayString = toLocalDateString(today);

	const byDate = ordered.findIndex((row) => {
		const date = (row.date ?? '').slice(0, 10);
		return date.length === 10 && date >= todayString;
	});
	if (byDate >= 0) return byDate;

	const flagged = ordered.findIndex((row) => row.is_today);
	return flagged >= 0 ? flagged : null;
}

/**
 * Whether the week has anything to say.
 *
 * A week with nothing planned and nothing run is not a state worth a bar —
 * an empty track reads as a failure rather than as an absence. Anything run
 * counts even with nothing planned: an unplanned run is still a run.
 */
export function hasWeekVolume(volume: WeekVolume | null | undefined): volume is WeekVolume {
	if (!volume) return false;
	return volume.doneKm > 0 || volume.plannedKm > 0;
}

/**
 * How much of the plan is out of reach: planned kilometres that lie on days
 * already gone by unrun. Zero on a week that is still on track.
 */
export function shortfallKm(volume: WeekVolume): number {
	return Math.max(0, volume.plannedKm - volume.reachableKm);
}

/** The bar's geometry: every mark as a fraction 0–1 of the track's width. */
export interface VolumeBar {
	/** Filled: kilometres already run. */
	done: number;
	/** The ceiling — done plus what is still ahead. Never left of `done`. */
	reachable: number;
	/**
	 * Where the plan's 100% mark sits: exactly 1 while the plan is the biggest
	 * number on the bar, and left of it once something has passed the plan. 0
	 * on a week with no plan at all.
	 */
	planned: number;
}

/**
 * Lay the week out on a track scaled to whatever is biggest on it.
 *
 * The plan gets the whole track for as long as it is the largest number
 * there, so an ordinary week is read against its own end and no space is held
 * back for headroom nobody is using.
 *
 * Headroom appears only when it is needed. The moment a runner passes the
 * plan — or is on course to, having already banked more than the days behind
 * them asked for — the track scales to that instead, and the plan mark slides
 * in from the end to show where 100% was. So over-delivery is drawn as
 * over-delivery rather than as a full bar indistinguishable from mere
 * compliance, and a week that never goes over never pays for the privilege.
 *
 * A week with nothing planned scales to the distance run, which fills the
 * track and puts no plan mark on it: work done against no plan has met
 * everything that was asked of it.
 */
export function volumeBar(volume: WeekVolume): VolumeBar {
	const { doneKm, plannedKm, reachableKm } = volume;
	const scale = Math.max(plannedKm, doneKm, reachableKm);
	if (scale <= 0) return { done: 0, reachable: 0, planned: 0 };

	const done = doneKm / scale;
	return {
		done,
		reachable: Math.max(done, reachableKm / scale),
		planned: plannedKm / scale
	};
}
