import type { Schedule, UserStats } from '$lib/server/trenara/types';
import { entryLocalDate } from './schedule';
import { mondayOf, toLocalDateString } from './date';

/** Done against planned, for one ring. */
export interface RingProgress {
	done: number;
	planned: number;
}

/** The week at a glance: runs, distance, strength. */
export interface WeekProgress {
	/** Run sessions — the schedule's trainings against the entries filed for them. */
	sessions: RingProgress;
	distance: {
		doneKm: number;
		plannedKm: number;
		/** As the API named it, so a miles account is not silently labelled km. */
		unit: string;
	};
	strength: RingProgress;
}

/**
 * Read the current week's progress out of the two calls the app already makes.
 *
 * Counts come from the **schedule**, which is the only thing that knows what
 * was scheduled and what was filed against it. Distance comes from
 * `graph_stats.weeks`, whose stated week totals are authoritative — summing
 * entry distances here would disagree with the same numbers on the graph,
 * which reads the totals rather than the rows for the reasons documented in
 * `distance-graph.ts`.
 *
 * `schedule` may cover more than a week — the dashboard holds a whole month —
 * so everything is filtered to the Monday–Sunday window around `today` rather
 * than trusted to already be one week.
 */
export function readWeekProgress(
	schedule: Schedule | null | undefined,
	weeks: UserStats['graph_stats']['weeks'] | null | undefined,
	today: Date = new Date()
): WeekProgress {
	const monday = mondayOf(today);
	const nextMonday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 7);
	const from = toLocalDateString(monday);
	const until = toLocalDateString(nextMonday);
	const inWeek = (date: string) => date >= from && date < until;

	const trainings = (schedule?.trainings ?? []).filter((t) => inWeek(t.day_long.slice(0, 10)));
	const strength = (schedule?.strength_trainings ?? []).filter((s) => inWeek(s.day.slice(0, 10)));
	const entries = (schedule?.entries ?? []).filter((e) => inWeek(entryLocalDate(e.start_time)));

	const runsDone = entries.filter((e) => e.type === 'run').length;
	const strengthDone = entries.filter((e) => e.type === 'strength').length;

	// Without a schedule there is nothing to count, and reporting `0 / 0` beside
	// a real distance would read as "you did nothing" rather than "this did not
	// load". The stats series covers it: a day with a `todo` is a planned run
	// day, a day with a `done` is a day one was run. Day granularity, so two
	// runs on one day read as one — close enough to keep the ring honest, and
	// only ever used when the exact counts are unavailable.
	const sessions = schedule
		? {
				// A run filed against a week that planned fewer still counts: an extra
				// session is over-delivery, not a reason to report fewer than were run.
				done: runsDone,
				planned: Math.max(trainings.length, runsDone)
			}
		: runDaysFrom(weeks);

	return {
		sessions,
		distance: {
			doneKm: weeks?.done_value ?? 0,
			plannedKm: weeks?.todo_value ?? 0,
			unit: weeks?.todo_unit ?? weeks?.done_unit ?? 'km'
		},
		strength: {
			done: strengthDone,
			planned: Math.max(strength.length, strengthDone)
		}
	};
}

/**
 * Planned and run *days* from the stats week series — the fallback for a
 * missing schedule. See its use in `readWeekProgress`.
 */
function runDaysFrom(weeks: UserStats['graph_stats']['weeks'] | null | undefined): RingProgress {
	const rows = weeks?.data ?? [];
	const done = rows.filter((r) => (r.done_value ?? 0) > 0).length;
	const planned = rows.filter((r) => (r.todo_value ?? 0) > 0).length;
	return { done, planned: Math.max(planned, done) };
}

/**
 * Whether a ring has anything to say.
 *
 * `0 / 0` is not a state worth a ring: a week with no strength work scheduled
 * and none done has nothing to report, and an empty circle beside two full
 * ones reads as a failure rather than an absence. Anything done counts even
 * with nothing planned — an unplanned run is still a run.
 */
export function hasRing(done: number, planned: number): boolean {
	return done > 0 || planned > 0;
}

/** True when any of the three rings has something to show. */
export function hasAnyRing(progress: WeekProgress | null | undefined): progress is WeekProgress {
	if (!progress) return false;
	return (
		hasRing(progress.sessions.done, progress.sessions.planned) ||
		hasRing(progress.distance.doneKm, progress.distance.plannedKm) ||
		hasRing(progress.strength.done, progress.strength.planned)
	);
}

/**
 * How full a ring is, 0–1.
 *
 * Work done against no plan reads as full: a run filed in a week that asked
 * for nothing has met everything that was asked of it, and an empty ring
 * beside a real distance would say the opposite. The `0 / 0` case never
 * reaches here — `hasRing` drops that ring instead of drawing it either way.
 *
 * Over-delivery clamps at full.
 */
export function ringFraction(done: number, planned: number): number {
	if (planned <= 0) return done > 0 ? 1 : 0;
	return Math.min(1, Math.max(0, done / planned));
}
