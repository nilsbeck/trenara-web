import { trainingApi, userApi } from '$lib/server/trenara';
import type { Schedule } from '$lib/server/trenara/types';
import { getMonthTimestamps } from '$lib/utils/date';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies }) => {
	const [schedule, goal, userStats] = await Promise.all([
		getMonthlySchedule(cookies),
		trainingApi.getGoal(cookies).catch(() => null),
		userApi.getUserStats(cookies).catch(() => null)
	]);

	return {
		schedule,
		goal,
		userStats
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
	const schedules = await Promise.all(
		getMonthTimestamps(new Date()).map((ts) =>
			trainingApi.getSchedule(cookies, Math.floor(ts.getTime() / 1000))
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
