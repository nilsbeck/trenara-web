import { trainingApi, userApi } from '$lib/server/trenara';
import { passthrough } from '$lib/server/trenara/request';
import type { Schedule } from '$lib/server/trenara/types';
import { getMonthTimestamps } from '$lib/utils/date';
import { requireUser } from '$lib/server/auth/guard';
import { keepHistory } from '$lib/server/history/record';
import { readGoalChart, readGoalShare } from '$lib/server/history/goal-card-data';
import { afterResponse } from '$lib/server/after-response';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies, locals, isDataRequest }) => {
	const user = requireUser(locals);

	/**
	 * Whether this is a real navigation, as opposed to the `__data.json` fetch
	 * SvelteKit uses to bring the page's data along on a client-side one.
	 *
	 * A soft navigation between pages of the app can run this `load` several
	 * times in a burst — `cachedRead`'s minute-long hold on a week exists
	 * exactly for that, and forcing every one of them past it would spend the
	 * saving it was built for. A real navigation is different: typing the URL
	 * again, a hard reload, or pulling to refresh in the installed PWA, which
	 * has no other way to ask for the plan again — there is no in-page refresh
	 * control on first load, and native pull-to-refresh is just this. Answering
	 * it from a cache the runner has no way to bypass reads as the gesture
	 * having done nothing.
	 */
	const fresh = !isDataRequest;

	/**
	 * The history write, finished after the response rather than before it.
	 *
	 * It used to live in `goal-card.svelte`, which meant it only happened when
	 * somebody opened the card — and the prediction series is
	 * one-point-per-day with no way to fill a day in afterwards. So it moved
	 * here, the page a runner actually opens, and was awaited alongside the
	 * schedule on the reasoning that it cost no wall-clock time. It did cost
	 * some: two Trenara reads, then a chain of database round trips, and then
	 * the chart read waited for all of it. Nothing on this page needs what it
	 * writes, so it no longer holds the page; `afterResponse` keeps the
	 * function alive until it is done.
	 */
	afterResponse(keepHistory(cookies, user.id));

	// Cached reads, shared with `keepHistory` above: one upstream call each.
	const goalRead = trainingApi.getGoal(cookies).catch(() => null);
	const statsRead = userApi.getUserStats(cookies).catch(() => null);

	/**
	 * The goal card's chart and share link, read beside the schedule instead
	 * of one after the other behind it. Each waits only for what it needs —
	 * the goal, and the stats for today's reading — which a cached read
	 * settles long before six weeks of schedule do, so they cost the page no
	 * time of their own. Awaited rather than streamed: the card's head shows
	 * the trend and the share button, and it is the first thing on a phone.
	 */
	const [schedule, goal, userStats, history, share] = await Promise.all([
		getMonthlySchedule(cookies, fresh),
		goalRead,
		statsRead,
		Promise.all([goalRead, statsRead]).then(([g, s]) => readGoalChart(user.id, g, s)),
		goalRead.then((g) => readGoalShare(user.id, g))
	]);

	return {
		schedule,
		goal,
		userStats,
		history,
		share
	};
};

/**
 * The whole of the current month, every week of it.
 *
 * No trimming here, unlike `/api/v1/schedule`: this is what seeds an empty
 * calendar, so there is nothing already in hand for a partial answer to be
 * grafted onto. Refreshes go through the API route, which does trim.
 */
async function getMonthlySchedule(
	cookies: import('@sveltejs/kit').Cookies,
	fresh: boolean
): Promise<Schedule> {
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
