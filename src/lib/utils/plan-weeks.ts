import { mondayOf } from './date';
import type { UserStats } from '$lib/server/trenara/types';

/**
 * What a week of the plan is for.
 *
 * Ours, not the coach's: nothing in any response labels a week, so these are
 * read off the volume curve. Anything showing them should say so.
 */
export type PlanWeekRole = 'build' | 'peak' | 'recovery' | 'steady' | 'taper';

/**
 * Which way a week can go wrong.
 *
 * The distinction that matters, and the reason a single "important" flag would
 * be worse than nothing: a build or peak week is missed by doing too little, a
 * recovery week or a taper by doing too much. A runner catching up after a
 * missed block is exactly the person most likely to wreck a down week.
 */
export type PlanWeekDirection = 'complete' | 'respect' | 'none';

export interface PlanWeek {
	/** ISO week number, as the API numbers it. */
	week: number;
	year: number;
	/** Month label the API sends for this week, for axis grouping. */
	month: string;
	/** The Monday this week starts on, at local midnight. */
	startsOn: Date;
	isCurrent: boolean;
	plannedKm: number;
	/**
	 * What was actually run, or `null` for no data.
	 *
	 * Not zero, and not proof of a missed week: a pause, a holiday and an
	 * unsynced watch all arrive here as `null`. Judgement belongs to the caller.
	 */
	completedKm: number | null;
	/**
	 * Planned distance as a ratio of the week before — `1.46` for a 46% jump.
	 *
	 * `null` when the preceding week is not in the series, which happens more
	 * than you would think: see `hasGaps`. Never compared across a gap, because
	 * a ratio to the week before last is not a ramp.
	 */
	ramp: number | null;
	/** This week's share of the plan's total planned distance, 0–1. */
	share: number;
	role: PlanWeekRole;
	direction: PlanWeekDirection;
}

export interface PlanWeeks {
	/** One entry per row the API sent, in the order it sent them. */
	weeks: PlanWeek[];
	/** From the response's own totals, never the sum of the rows — see `hasGaps`. */
	totalPlannedKm: number;
	totalCompletedKm: number;
	/**
	 * True when the rows do not account for the whole plan.
	 *
	 * The series can begin after the goal does: in a response captured on
	 * 2026-08-24 the twelve rows added to 564.57 km against a stated total of
	 * 595.36, the difference being the goal's first week, which had no row at
	 * all. So "inside the goal, no data for this week" is a real state, and
	 * distinct from "outside the goal".
	 */
	hasGaps: boolean;
}

/** A week has to drop by at least this much to read as a taper rather than a plateau. */
const TAPER_DROP = 0.1;
/** Below this ratio of the previous week, a week is a deliberate step down. */
const RECOVERY_RATIO = 0.9;
/** Above this ratio of the previous week, a week is a step up. */
const BUILD_RATIO = 1.1;
/** A taper is a handful of weeks, never half a plan. */
const MAX_TAPER_WEEKS = 3;

const DAY_MS = 86_400_000;

/** Monday of an ISO week, at local midnight. */
export function isoWeekStart(year: number, week: number): Date {
	// 4 January is always in ISO week 1, whichever weekday it lands on.
	const jan4 = new Date(year, 0, 4);
	const weekday = jan4.getDay() || 7;
	const firstMonday = new Date(year, 0, 4 - weekday + 1);
	return new Date(
		firstMonday.getFullYear(),
		firstMonday.getMonth(),
		firstMonday.getDate() + (week - 1) * 7
	);
}

function isAdjacent(previous: Date, current: Date): boolean {
	return Math.round((current.getTime() - previous.getTime()) / DAY_MS) === 7;
}

/**
 * Read the goal's week series into something a UI can render.
 *
 * Takes `graph_stats.goal`, which carries planned and completed distance for
 * every week of the current goal — future weeks included — so the shape of a
 * plan is available without fetching a single week of schedule, and without a
 * request the dashboard does not already make.
 *
 * Distance only. The series carries no time and no session type, so an
 * interval week and an easy week of the same volume are indistinguishable
 * here; load would mean pricing each week's sessions from the schedule.
 */
export function readPlanWeeks(
	goal: UserStats['graph_stats']['goal'] | null | undefined
): PlanWeeks {
	const rows = goal?.data ?? [];
	const totalPlannedKm = goal?.todo_value ?? 0;
	const totalCompletedKm = goal?.done_value ?? 0;

	if (rows.length === 0) {
		return { weeks: [], totalPlannedKm, totalCompletedKm, hasGaps: false };
	}

	const base = rows.map((row) => ({
		week: row.week,
		year: row.year,
		month: row.month,
		startsOn: isoWeekStart(row.year, row.week),
		isCurrent: row.is_current_week,
		plannedKm: row.todo_value ?? 0,
		completedKm: row.done_value ?? null
	}));

	const peakKm = Math.max(...base.map((w) => w.plannedKm));
	const taper = taperWeeks(base);

	const weeks: PlanWeek[] = base.map((row, i) => {
		const previous = i > 0 && isAdjacent(base[i - 1].startsOn, row.startsOn) ? base[i - 1] : null;
		const next =
			i + 1 < base.length && isAdjacent(row.startsOn, base[i + 1].startsOn) ? base[i + 1] : null;
		const ramp = previous && previous.plannedKm > 0 ? row.plannedKm / previous.plannedKm : null;
		const role = classify(row, {
			next,
			ramp,
			peakKm,
			isTaper: taper.has(row.startsOn.getTime())
		});

		return {
			...row,
			ramp,
			share: totalPlannedKm > 0 ? row.plannedKm / totalPlannedKm : 0,
			role,
			direction: directionOf(role)
		};
	});

	const rowSum = base.reduce((sum, w) => sum + w.plannedKm, 0);
	const contiguous = base.every((w, i) => i === 0 || isAdjacent(base[i - 1].startsOn, w.startsOn));
	// 0.5 km of slack: the rows are rounded to two decimals and the total is not
	// derived from them, so an exact match is not something to rely on.
	const hasGaps = !contiguous || rowSum < totalPlannedKm - 0.5;

	return { weeks, totalPlannedKm, totalCompletedKm, hasGaps };
}

type BaseWeek = {
	startsOn: Date;
	plannedKm: number;
};

/**
 * The run of decreasing weeks at the end of the plan.
 *
 * Walks back from the last row while each week drops meaningfully on the one
 * before it. A drop has to clear `TAPER_DROP` — a plan that eases by a few
 * per cent is levelling off, not tapering, and calling that a taper would tell
 * a runner to back off in a week that is still work.
 */
function taperWeeks(rows: BaseWeek[]): Set<number> {
	const taper = new Set<number>();
	for (let i = rows.length - 1; i > 0 && taper.size < MAX_TAPER_WEEKS; i--) {
		const previous = rows[i - 1];
		if (!isAdjacent(previous.startsOn, rows[i].startsOn)) break;
		if (previous.plannedKm <= 0) break;
		if (rows[i].plannedKm > previous.plannedKm * (1 - TAPER_DROP)) break;
		taper.add(rows[i].startsOn.getTime());
	}
	return taper;
}

function classify(
	row: BaseWeek,
	context: {
		next: BaseWeek | null;
		ramp: number | null;
		peakKm: number;
		isTaper: boolean;
	}
): PlanWeekRole {
	// Order matters. A taper week is not a recovery week even though it drops,
	// and the peak is the peak whatever its ramp says.
	if (context.isTaper) return 'taper';
	if (row.plannedKm === context.peakKm) return 'peak';

	// Without an adjacent neighbour there is no ramp to judge, and guessing from
	// the week before last would put a label on a plan we cannot see.
	if (context.ramp === null) return 'steady';

	if (context.ramp < RECOVERY_RATIO && context.next && context.next.plannedKm > row.plannedKm) {
		return 'recovery';
	}
	if (context.ramp > BUILD_RATIO) return 'build';
	return 'steady';
}

function directionOf(role: PlanWeekRole): PlanWeekDirection {
	switch (role) {
		case 'build':
		case 'peak':
			return 'complete';
		case 'recovery':
		case 'taper':
			return 'respect';
		default:
			return 'none';
	}
}

/**
 * The plan week containing `date`, or null when the series has nothing for it.
 *
 * Null covers both "outside the goal" and "inside it, but this week has no
 * row" — check `hasGaps` if the difference matters to the caller.
 */
export function planWeekFor(plan: PlanWeeks, date: Date): PlanWeek | null {
	const monday = mondayOf(date).getTime();
	return plan.weeks.find((w) => w.startsOn.getTime() === monday) ?? null;
}

/** A week ahead that is worth knowing about before it starts. */
export interface UpcomingWeek {
	week: PlanWeek;
	/** Whole weeks from the one containing `today`. Always 1 or more. */
	weeksAway: number;
}

/**
 * The weeks ahead worth a warning, soonest first.
 *
 * Only weeks that have not started: a peak week you are already three days into
 * is news you cannot act on. Ordinary weeks are never returned — the point is
 * to spend a reader's attention on the few weeks that change what they should
 * do, and a list of every week ahead is a list nobody reads.
 */
export function upcomingWeeks(plan: PlanWeeks, today: Date, limit = 2): UpcomingWeek[] {
	const thisMonday = mondayOf(today).getTime();

	return plan.weeks
		.filter((w) => w.role !== 'steady' && w.startsOn.getTime() > thisMonday)
		.slice(0, limit)
		.map((week) => ({
			week,
			weeksAway: Math.round((week.startsOn.getTime() - thisMonday) / (7 * DAY_MS))
		}));
}

/** "Next week", "In 3 weeks" — how a warning names its distance. */
export function weeksAwayLabel(weeksAway: number): string {
	return weeksAway <= 1 ? 'Next week' : `In ${weeksAway} weeks`;
}

/** A week ahead, said in a sentence rather than a badge. */
export interface PlanWeekWarning {
	headline: string;
	/** What to do about it. The part a badge cannot carry. */
	advice: string;
	direction: PlanWeekDirection;
}

/**
 * How a week ahead should read on a card.
 *
 * Deliberately a sentence: "your biggest week" tells a runner something, a red
 * dot does not. The advice half is what makes the direction actionable — the
 * weeks that want less are as easy to get wrong as the weeks that want more,
 * and are the ones a runner catching up will trample.
 */
export function planWeekWarning(week: PlanWeek): PlanWeekWarning | null {
	const km = Math.round(week.plannedKm);
	const shift = week.ramp === null ? null : Math.abs(Math.round((week.ramp - 1) * 100));

	switch (week.role) {
		case 'peak':
			return {
				headline: `the biggest week of the plan, at ${km} km`,
				advice: 'Worth clearing the diary for.',
				direction: week.direction
			};
		case 'build':
			return {
				headline:
					shift === null
						? `a step up, to ${km} km`
						: `a step up to ${km} km, ${shift}% above the week before`,
				advice: 'Plan the long one before the week starts.',
				direction: week.direction
			};
		case 'recovery':
			return {
				headline: shift === null ? `an easier ${km} km` : `an easier ${km} km, down ${shift}%`,
				advice: 'The drop is deliberate — resist topping it up.',
				direction: week.direction
			};
		case 'taper':
			return {
				headline: `the taper, at ${km} km`,
				advice: 'Freshness now, not fitness. Doing more costs you.',
				direction: week.direction
			};
		default:
			return null;
	}
}
