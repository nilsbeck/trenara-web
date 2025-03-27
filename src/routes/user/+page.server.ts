import { userApi, trainingApi, type Schedule } from '$lib/server/api';
import { redirect, type RequestEvent } from '@sveltejs/kit';
import { getSessionTokenCookie, TokenType } from '$lib/server/auth';
import type { PageServerLoad } from './$types';

function daysInMonth(year: number, month: number): number {
	return new Date(year, month + 1, 0).getDate();
}

export const load: PageServerLoad = async (event) => {
	if (!getSessionTokenCookie(event.cookies, TokenType.AccessToken)) {
		return redirect(302, '/login');
	}

	return {
		user: event.cookies.get('user'),
		goal: trainingApi.getGoal(event.cookies),
		userStats: userApi.getUserStats(event.cookies),
		schedule: getMonthlySchedule(event)
	};
};

const getMonthlySchedule = async (event: RequestEvent) => {
	const timestamp = new Date().getTime();
    const timestamps: Date[] = [];
	const schedules: Promise<Schedule>[] = [];

	const month = new Date(timestamp).getMonth();
    const firstDayOfMonthDate = new Date(new Date().getFullYear(), month, 1);
	const firstDayOfMonth = firstDayOfMonthDate.getDay();
    const nextMonday = new Date(firstDayOfMonthDate);
    nextMonday.setDate(nextMonday.getDate() + ((1 + 7 - firstDayOfMonthDate.getDay()) % 7 || 7));
	const offsetAtStart = firstDayOfMonth == 0 ? firstDayOfMonth + 6 : firstDayOfMonth - 1;

    const weeksInMonth = Math.ceil((offsetAtStart + daysInMonth(firstDayOfMonthDate.getFullYear(), firstDayOfMonthDate.getMonth())) / 7);
	
	timestamps.push(firstDayOfMonthDate);
	const newDate = new Date(nextMonday);
	timestamps.push(newDate);
    for (let i = timestamps.length; i < weeksInMonth; i++) {
		nextMonday.setDate(nextMonday.getDate() + 7);
		const newDate = new Date(nextMonday);
		timestamps.push(newDate);
    }

    for (let i = 0; i < timestamps.length; i++) {
        const schedule = trainingApi.getSchedule(event.cookies, Math.floor(timestamps[i].getTime() / 1000));
        schedules.push(schedule);
    }

    return Promise.all(schedules); // Return a promise that resolves when all schedules are fetched
};
