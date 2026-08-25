import type { Cookies } from '@sveltejs/kit';
import { trainingApi } from './training';
import { userApi } from './user';
import { readWeekProgress, type WeekProgress } from '$lib/utils/week-progress';
import { mondayOf } from '$lib/utils/date';

/**
 * This week's rings for the navbar.
 *
 * One week of schedule for the counts and the user stats for the distance —
 * see `readWeekProgress` for why the two sources are not interchangeable. Both
 * fail soft: the navbar is chrome on every page in the app, and a stats call
 * that times out must not be able to take a page down with it.
 *
 * Returns null when there is nothing to show, which the navbar renders as
 * nothing at all rather than as a row of empty rings.
 */
export async function loadWeekProgress(
	cookies: Cookies,
	today: Date = new Date()
): Promise<WeekProgress | null> {
	const monday = mondayOf(today);

	const [schedule, userStats] = await Promise.all([
		trainingApi.getSchedule(cookies, Math.floor(monday.getTime() / 1000)).catch(() => null),
		userApi.getUserStats(cookies).catch(() => null)
	]);

	if (!schedule && !userStats) return null;

	return readWeekProgress(schedule, userStats?.graph_stats?.weeks, today);
}
