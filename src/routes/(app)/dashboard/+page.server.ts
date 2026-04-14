import { trainingApi, userApi } from '$lib/server/trenara';
import type { Schedule } from '$lib/server/trenara/types';
import type { PageServerLoad } from './$types';

function daysInMonth(year: number, month: number): number {
	return new Date(year, month + 1, 0).getDate();
}

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

async function getMonthlySchedule(cookies: import('@sveltejs/kit').Cookies): Promise<Schedule> {
	const now = new Date();
	const month = now.getMonth();
	const year = now.getFullYear();
	const firstDayOfMonthDate = new Date(year, month, 1);
	const firstDayOfMonth = firstDayOfMonthDate.getDay();

	const nextMonday = new Date(firstDayOfMonthDate);
	nextMonday.setDate(
		nextMonday.getDate() + ((1 + 7 - firstDayOfMonthDate.getDay()) % 7 || 7)
	);
	const offsetAtStart = firstDayOfMonth === 0 ? firstDayOfMonth + 6 : firstDayOfMonth - 1;
	const weeksInMonth = Math.ceil(
		(offsetAtStart + daysInMonth(year, month)) / 7
	);

	const timestamps: Date[] = [firstDayOfMonthDate];
	const mondayDate = new Date(nextMonday);
	timestamps.push(mondayDate);

	for (let i = timestamps.length; i < weeksInMonth; i++) {
		nextMonday.setDate(nextMonday.getDate() + 7);
		timestamps.push(new Date(nextMonday));
	}

	const schedules = await Promise.all(
		timestamps.map((ts) =>
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
