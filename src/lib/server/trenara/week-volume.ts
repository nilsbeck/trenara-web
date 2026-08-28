import type { Cookies } from '@sveltejs/kit';
import { userApi } from './user';
import { readWeekVolume, type WeekVolume } from '$lib/utils/week-volume';

/**
 * This week's volume bar for the navbar.
 *
 * The user stats carry the whole week — totals and one row per day — so this
 * is a single call, not a join against the schedule. It fails soft: the
 * navbar is chrome on every page in the app, and a stats call that times out
 * must not be able to take a page down with it.
 *
 * Returns null when there is nothing to show, which the navbar renders as
 * nothing at all rather than as an empty bar.
 */
export async function loadWeekVolume(
	cookies: Cookies,
	today: Date = new Date()
): Promise<WeekVolume | null> {
	const userStats = await userApi.getUserStats(cookies).catch(() => null);
	if (!userStats) return null;

	return readWeekVolume(userStats.graph_stats?.weeks, today);
}
