import { requireUser } from '#lib/server/auth/guard.js';
import { keepHistory } from '#lib/server/history/record.js';
import { readGoalChart, readGoalShare } from '#lib/server/history/goal-card-data.js';
import { afterResponse } from '#lib/server/after-response.js';
import { timed } from '#lib/server/timing.js';
import { startDashboardReads } from '#lib/server/dashboard/reads.js';
import { OPENING_VIEW_COOKIE, openingViewFor } from '#lib/utils/opening-view.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies, locals, request, isDataRequest }) => {
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

	/**
	 * The schedule, the goal and the stats from Trenara — already on their way
	 * if `handleAuth` started them beside the identity check, which it does for
	 * a launch onto this page (`startsDashboardEarly` in `hooks.server.ts`), and
	 * asked for here otherwise. The goal and stats are cached reads, shared with
	 * `keepHistory` above: one upstream call each either way.
	 */
	const reads = locals.dashboardReads ?? startDashboardReads(cookies, { fresh }, locals);

	/**
	 * The goal card's chart and share link, read beside the schedule instead
	 * of one after the other behind it. Each waits only for what it needs —
	 * the goal, and the stats for today's reading — which a cached read
	 * settles long before six weeks of schedule do, so they cost the page no
	 * time of their own. Awaited rather than streamed: the card's head shows
	 * the trend and the share button, and it is the first thing on a phone.
	 */
	const [schedule, goal, userStats, history, share] = await Promise.all([
		reads.schedule,
		reads.goal,
		reads.stats,
		timed(
			locals,
			'chart',
			Promise.all([reads.goal, reads.stats]).then(([g, s]) => readGoalChart(user.id, g, s))
		),
		timed(
			locals,
			'share',
			reads.goal.then((g) => readGoalShare(user.id, g))
		)
	]);

	return {
		schedule,
		goal,
		userStats,
		history,
		share,
		/**
		 * The view the calendar is drawn in, from what this device's media query
		 * said last time, or failing that from the device itself. Decided here
		 * rather than in the browser so the server draws the week a phone will
		 * fold to anyway, instead of a month it collapses after hydrating.
		 */
		openingView: openingViewFor(cookies.get(OPENING_VIEW_COOKIE), request.headers)
	};
};
