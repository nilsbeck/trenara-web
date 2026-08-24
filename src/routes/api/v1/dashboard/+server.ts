import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { trainingApi, userApi } from '$lib/server/trenara';

/**
 * Everything on the dashboard except the calendar.
 *
 * Exists so a background refresh does not have to go through `invalidateAll`,
 * which would re-run the page load and fetch the whole month again — the very
 * work `/api/v1/schedule?from=` is there to avoid. Both cards fail soft, like
 * the page load they mirror: a missing goal is a card that does not render,
 * not a refresh that fails.
 */
export const GET: RequestHandler = async ({ cookies, locals }) => {
	if (!locals.user) {
		error(401, 'Unauthorized');
	}

	const [goal, userStats] = await Promise.all([
		trainingApi.getGoal(cookies).catch(() => null),
		userApi.getUserStats(cookies).catch(() => null)
	]);

	return json({ goal, userStats });
};
