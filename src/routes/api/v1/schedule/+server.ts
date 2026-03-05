import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { trainingApi } from '$lib/server/trenara';
import { TokenType } from '$lib/server/auth/types';

function daysInMonth(year: number, month: number): number {
	return new Date(year, month + 1, 0).getDate();
}

export const GET: RequestHandler = async ({ url, cookies }) => {
	if (!cookies.get(TokenType.AccessToken)) {
		error(401, 'Unauthorized');
	}

	const dateParam = url.searchParams.get('date');
	const date = dateParam ? new Date(Number(dateParam)) : new Date();

	const month = date.getMonth();
	const year = date.getFullYear();
	const firstDayOfMonthDate = new Date(year, month, 1);
	const firstDayOfMonth = firstDayOfMonthDate.getDay();

	const nextMonday = new Date(firstDayOfMonthDate);
	nextMonday.setDate(
		nextMonday.getDate() + ((1 + 7 - firstDayOfMonthDate.getDay()) % 7 || 7)
	);
	const offsetAtStart = firstDayOfMonth === 0 ? firstDayOfMonth + 6 : firstDayOfMonth - 1;
	const weeksInMonth = Math.ceil((offsetAtStart + daysInMonth(year, month)) / 7);

	const timestamps: Date[] = [firstDayOfMonthDate];
	timestamps.push(new Date(nextMonday));

	for (let i = timestamps.length; i < weeksInMonth; i++) {
		nextMonday.setDate(nextMonday.getDate() + 7);
		timestamps.push(new Date(nextMonday));
	}

	const schedules = await Promise.all(
		timestamps.map((ts) =>
			trainingApi.getSchedule(cookies, Math.floor(ts.getTime() / 1000))
		)
	);

	const merged = {
		id: 0,
		start_day: 0,
		start_day_long: '',
		training_week: 0,
		type: 'ultimate' as const,
		trainings: schedules.flatMap((s) => s.trainings),
		strength_trainings: schedules.flatMap((s) => s.strength_trainings),
		entries: schedules.flatMap((s) => s.entries)
	};

	return json(merged);
};
