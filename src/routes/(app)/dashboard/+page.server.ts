import { trainingApi, userApi } from '$lib/server/trenara';
import { passthrough } from '$lib/server/trenara/request';
import type { Schedule } from '$lib/server/trenara/types';
import { getMonthTimestamps } from '$lib/utils/date';
import { requireUser } from '$lib/server/auth/guard';
import { keepHistory } from '$lib/server/history/record';
import { predictionHistoryDAO } from '$lib/server/db/prediction-history';
import { toChartData } from '$lib/server/history/chart-points';
import { STORAGE_READ_MESSAGE } from '$lib/server/db/errors';
import type { ChartDataPoint } from '$lib/components/charts/prediction-chart.svelte';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies, locals }) => {
	const user = requireUser(locals);

	/**
	 * The history write rides along with the page's own fetches.
	 *
	 * It used to happen in `goal-card.svelte`, which meant it only happened
	 * when somebody opened the card — and the prediction series is
	 * one-point-per-day with no way to fill a day in afterwards, so a fortnight
	 * of not looking was a fortnight of gaps, permanently. The dashboard is the
	 * page a runner actually opens, and it already holds everything the record
	 * needs.
	 *
	 * Inside the same `Promise.all` as the schedule, so it costs no wall-clock
	 * time: two database round trips against six weeks of upstream fetches. It
	 * never rejects, so it cannot fail the page either.
	 */
	const [schedule, goal, userStats] = await Promise.all([
		getMonthlySchedule(cookies),
		trainingApi.getGoal(cookies).catch(() => null),
		userApi.getUserStats(cookies).catch(() => null),
		keepHistory(cookies, user.id)
	]);

	/**
	 * The goal card's chart, resolved server-side now rather than fetched by
	 * the card on mount — see `(app)/goal/+page.server.ts` for the fuller
	 * account. Read after `keepHistory`, so a prediction just recorded above
	 * is already in the row this reads. Caught rather than thrown: a failure
	 * here is a fact the chart shows inline, not a reason to fail the
	 * dashboard.
	 */
	let history: { records: ChartDataPoint[]; error: string | null };
	try {
		const records = await predictionHistoryDAO.getUserPredictionHistory(user.id, {
			startDate: goal?.start_date || undefined,
			limit: 200
		});
		history = { records: toChartData(records), error: null };
	} catch {
		history = { records: [], error: STORAGE_READ_MESSAGE };
	}

	return {
		schedule,
		goal,
		userStats,
		history
	};
};

/**
 * The whole of the current month, every week of it.
 *
 * No trimming here, unlike `/api/v1/schedule`: this is what seeds an empty
 * calendar, so there is nothing already in hand for a partial answer to be
 * grafted onto. Refreshes go through the API route, which does trim.
 */
async function getMonthlySchedule(cookies: import('@sveltejs/kit').Cookies): Promise<Schedule> {
	// The calendar is the page, so this one is allowed to fail it — but it has
	// to fail it as a status the error page can speak to. Left bare, a Trenara
	// outage told the runner "Internal Error", which points at the wrong server.
	const schedules = await passthrough(() =>
		Promise.all(
			getMonthTimestamps(new Date()).map((ts) =>
				trainingApi.getSchedule(cookies, Math.floor(ts.getTime() / 1000))
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
