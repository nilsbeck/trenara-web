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

	return {
		sessions: {
			// A run filed against a week that planned fewer still counts: an extra
			// session is over-delivery, not a reason to report fewer than were run.
			done: runsDone,
			planned: Math.max(trainings.length, runsDone)
		},
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
 * How full a ring is, 0–1.
 *
 * Nothing planned reads as empty rather than complete: a week with no strength
 * work scheduled has not "finished" its strength work, and a full ring against
 * `0 / 0` would say it had. Over-delivery clamps at full.
 */
export function ringFraction(done: number, planned: number): number {
	if (planned <= 0) return 0;
	return Math.min(1, Math.max(0, done / planned));
}
