import type { Schedule } from '$lib/server/api/types';
import type { RequestEvent } from '@sveltejs/kit';
import { trainingApi } from '$lib/server/api';
import { json } from '@sveltejs/kit';

function daysInMonth(year: number, month: number): number {
	return new Date(year, month + 1, 0).getDate();
}

export const GET = async (event: RequestEvent) => {
	const timestamp = event.url.searchParams.get('timestamp');
	if (!timestamp) {
		return json({ error: 'Timestamp is required' }, { status: 400 });
	}

	const timestamps: Date[] = [];
	const schedules: Promise<Schedule>[] = [];

	const requestedDate = new Date(timestamp);
	const month = requestedDate.getMonth();
	const year = requestedDate.getFullYear();
	const firstDayOfMonthDate = new Date(year, month, 1);
	const firstDayOfMonth = firstDayOfMonthDate.getDay();
	const nextMonday = new Date(firstDayOfMonthDate);
	nextMonday.setDate(nextMonday.getDate() + ((1 + 7 - firstDayOfMonthDate.getDay()) % 7 || 7));
	const offsetAtStart = firstDayOfMonth == 0 ? firstDayOfMonth + 6 : firstDayOfMonth - 1;

	const weeksInMonth = Math.ceil(
		(offsetAtStart +
			daysInMonth(firstDayOfMonthDate.getFullYear(), firstDayOfMonthDate.getMonth())) /
			7
	);

	timestamps.push(firstDayOfMonthDate);
	const newDate = new Date(nextMonday);
	timestamps.push(newDate);
	for (let i = timestamps.length; i < weeksInMonth; i++) {
		nextMonday.setDate(nextMonday.getDate() + 7);
		const newDate = new Date(nextMonday);
		timestamps.push(newDate);
	}

	for (let i = 0; i < timestamps.length; i++) {
		const schedule = trainingApi.getSchedule(
			event.cookies,
			Math.floor(timestamps[i].getTime() / 1000)
		);
		schedules.push(schedule);
	}

	const mergedSchedule = mergeSchedules(await Promise.all(schedules));

	return json(mergedSchedule);
};

function mergeSchedules(schedules: Schedule[]): Schedule {
	const mergedSchedule: Schedule = {
		id: 0,
		start_day: 0,
		start_day_long: '',
		training_week: 0,
		type: 'ultimate',
		trainings: [],
		strength_trainings: [],
		entries: []
	};

	schedules.forEach((schedule) => {
		mergedSchedule.trainings = mergedSchedule.trainings.concat(schedule.trainings);
		mergedSchedule.strength_trainings = mergedSchedule.strength_trainings.concat(
			schedule.strength_trainings
		);
		mergedSchedule.entries = mergedSchedule.entries.concat(schedule.entries);
	});

	return mergedSchedule;
}
