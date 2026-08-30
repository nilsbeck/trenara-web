import type { Schedule } from '$lib/server/trenara/types';
import { dayKeyOf, parseLocalDateString, toLocalDateString } from './date';
import { entryLocalDate } from './schedule';

/**
 * Which day the calendar should open on.
 *
 * Today is the obvious answer and the wrong one on the days it matters most: a
 * rest day opens on an empty panel, and the run finished yesterday that still
 * wants a rating is a click away rather than in front of the runner. So, in
 * order:
 *
 * 1. The last completed run, if it has no RPE yet — the one thing the app can
 *    still ask the runner for.
 * 2. Today, when there is anything on it at all: a session planned, a strength
 *    block, or a run already logged.
 * 3. The next session ahead of today, whichever kind comes first.
 *
 * Falling through all three — an empty week, or no schedule yet — leaves today,
 * which is where the calendar used to open unconditionally.
 *
 * Only what the schedule in hand covers can be picked, so the search is bounded
 * by the month the page loaded (plus whatever the weeks either side of it drag
 * in). A session from months back never pulls the calendar to it.
 */
export function initialCalendarDay(schedule: Schedule | null | undefined, today: Date): Date {
	const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
	if (!schedule) return todayStart;

	const todayString = toLocalDateString(todayStart);

	const lastRun = lastCompletedRun(schedule, todayString);
	if (lastRun && lastRun.rpe == null) {
		return parseLocalDateString(lastRun.date) ?? todayStart;
	}

	if (hasAnythingOn(schedule, todayString)) return todayStart;

	const next = nextSessionAfter(schedule, todayString);
	return (next && parseLocalDateString(next)) || todayStart;
}

/**
 * The most recent run logged on or before `todayString`.
 *
 * "Most recent" is by start time, not by date alone: two runs on the same day
 * mean the later one is the one whose rating is outstanding.
 */
function lastCompletedRun(
	schedule: Schedule,
	todayString: string
): { date: string; rpe: number | null } | null {
	let best: { date: string; startedAt: number; rpe: number | null } | null = null;

	for (const entry of schedule.entries ?? []) {
		if (entry.type !== 'run') continue;

		// An entry with no readable start time cannot be ordered against the
		// others, so it cannot be the most recent one either.
		const date = entryLocalDate(entry.start_time);
		if (date === null || date > todayString) continue;

		const startedAt = new Date(entry.start_time).getTime();
		if (best && !(date > best.date || (date === best.date && startedAt > best.startedAt))) continue;

		best = { date, startedAt, rpe: entry.rpe };
	}

	return best ? { date: best.date, rpe: best.rpe } : null;
}

/** Whether the day holds a planned session of either kind, or a logged one. */
function hasAnythingOn(schedule: Schedule, date: string): boolean {
	return (
		(schedule.trainings ?? []).some((training) => dayKeyOf(training.day_long) === date) ||
		(schedule.strength_trainings ?? []).some((strength) => dayKeyOf(strength.day) === date) ||
		(schedule.entries ?? []).some((entry) => entryLocalDate(entry.start_time) === date)
	);
}

/** The nearest planned session strictly after `todayString`, run or strength. */
function nextSessionAfter(schedule: Schedule, todayString: string): string | null {
	let soonest: string | null = null;

	const consider = (date: string | null) => {
		if (date === null || date <= todayString) return;
		if (soonest === null || date < soonest) soonest = date;
	};

	for (const training of schedule.trainings ?? []) {
		consider(dayKeyOf(training.day_long));
	}
	for (const strength of schedule.strength_trainings ?? []) {
		consider(dayKeyOf(strength.day));
	}

	return soonest;
}
