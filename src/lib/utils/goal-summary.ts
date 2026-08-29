import type { Goal, UserStats } from '$lib/server/trenara/types';

const MS_PER_WEEK = 1000 * 60 * 60 * 24 * 7;

/**
 * Whole weeks between now and race day, never negative.
 *
 * Shared with the goal card rather than computed beside it: the card's event
 * line and the dashboard's collapsed strip make the same claim in two places,
 * and two copies of the same `Math.ceil` drift the moment one is tuned.
 */
export function weeksRemaining(endDate: Date, now: Date): number {
	return Math.max(0, Math.ceil((endDate.getTime() - now.getTime()) / MS_PER_WEEK));
}

/**
 * What the goal card says when it is closed.
 *
 * Every field here comes off `goal` and `userStats` alone — both already
 * awaited by the dashboard's `load` — so the strip paints with the first
 * frame. Nothing that needs the prediction-history fetch belongs in it: the
 * race-day forecast is worth more than any of this, but a summary that
 * arrives a second late is a summary nobody reads.
 */
export interface GoalSummary {
	name: string;
	weeks: number;
	/** Race day has been and gone, so a countdown would read "0 weeks to go". */
	isPast: boolean;
	/** Null before the API has predicted this goal — a fresh plan has no reading yet. */
	predictedTime: string | null;
	/** Shortened to "5:16 /km" — see `shortenPaceUnit`. */
	predictedPace: string | null;
}

/**
 * "5:16 min/km" -> "5:16 /km".
 *
 * The strip gives the countdown and the prediction one line between them, and
 * on a 390px screen the three characters of "min" are the difference between
 * two lines and three. The card's own forecast row already writes a pace this
 * way, so this is the house spelling rather than one invented here.
 *
 * A suffix swap rather than a hardcoded "/km", because the unit follows the
 * account: an imperial runner gets "min/mi", and keeps it.
 */
export function shortenPaceUnit(pace: string): string {
	return pace.replace(/\bmin\//, '/');
}

export function readGoalSummary(
	goal: Goal | null | undefined,
	userStats: UserStats | null | undefined,
	now: Date
): GoalSummary | null {
	if (!goal?.name || !goal.end_date) return null;

	const endDate = new Date(goal.end_date);
	if (Number.isNaN(endDate.getTime())) return null;

	return {
		name: goal.name,
		weeks: weeksRemaining(endDate, now),
		isPast: now > endDate,
		// Empty strings are as absent as nulls here, and the API sends both.
		predictedTime: userStats?.best_times?.time_for_goal || null,
		predictedPace: userStats?.best_times?.pace_for_goal
			? shortenPaceUnit(userStats.best_times.pace_for_goal)
			: null
	};
}
