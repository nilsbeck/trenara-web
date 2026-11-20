import type { Cookies } from '@sveltejs/kit';
import { trainingApi, userApi } from '#lib/server/trenara/index.js';
import { passthrough } from '#lib/server/trenara/request.js';
import type { Goal, Schedule, UserStats } from '#lib/server/trenara/types.js';
import { getMonthTimestamps } from '#lib/utils/date.js';
import { timed } from '#lib/server/timing.js';

/**
 * The dashboard's reads from Trenara: the month's schedule, the goal, the
 * stats.
 *
 * Asked for by the token alone. Trenara checks the token on each of them, just
 * as it does on the account read that tells this app who the runner is, so
 * none of them needs that answer first — only the reads from this app's own
 * database do, being keyed by the runner's id. That is what lets
 * `handleAuth` start these beside the identity check on a dashboard load
 * rather than after it; see `startsDashboardEarly` in `hooks.server.ts`.
 */
export interface DashboardReads {
	schedule: Promise<Schedule>;
	/** Null when there is none, or it could not be read: the card renders without it. */
	goal: Promise<Goal | null>;
	stats: Promise<UserStats | null>;
}

/**
 * Start the dashboard's Trenara reads.
 *
 * Every promise is handled before it is handed back, because the hook may
 * start them and then never let the page run — a token Trenara refuses sends
 * the runner to sign in instead — and a rejection nobody awaits would be an
 * unhandled one. The page still sees the schedule's failure when it awaits it.
 */
export function startDashboardReads(
	cookies: Cookies,
	{ fresh }: { fresh: boolean },
	locals: App.Locals
): DashboardReads {
	const schedule = timed(locals, 'schedule', getMonthlySchedule(cookies, fresh));
	schedule.catch(() => {});

	return {
		schedule,
		goal: timed(locals, 'goal', trainingApi.getGoal(cookies)).catch(() => null),
		stats: timed(locals, 'stats', userApi.getUserStats(cookies)).catch(() => null)
	};
}

/**
 * The whole of the current month, every week of it.
 *
 * No trimming here, unlike `/api/v1/schedule`: this is what seeds an empty
 * calendar, so there is nothing already in hand for a partial answer to be
 * grafted onto. Refreshes go through the API route, which does trim.
 */
async function getMonthlySchedule(cookies: Cookies, fresh: boolean): Promise<Schedule> {
	// The calendar is the page, so this one is allowed to fail it — but it has
	// to fail it as a status the error page can speak to. Left bare, a Trenara
	// outage told the runner "Internal Error", which points at the wrong server.
	const schedules = await passthrough(() =>
		Promise.all(
			getMonthTimestamps(new Date()).map((ts) =>
				trainingApi.getSchedule(cookies, Math.floor(ts.getTime() / 1000), { fresh })
			)
		)
	);

	// Merge all weekly schedules into one
	const merged: Schedule = {
		id: 0,
		start_day: 0,
		start_day_long: '',
		training_week: 0,
		type: 'ultimate',
		trainings: [],
		strength_trainings: [],
		entries: []
	};

	for (const s of schedules) {
		merged.trainings = merged.trainings.concat(s.trainings);
		merged.strength_trainings = merged.strength_trainings.concat(s.strength_trainings);
		merged.entries = merged.entries.concat(s.entries);
	}

	return merged;
}
