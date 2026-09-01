import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { userApi } from '$lib/server/trenara';
import { parseBody, passthrough } from '$lib/server/trenara/request';
import { pauseGoalSchema } from '$lib/schemas/goal';

/**
 * Pause the plan, with the reason behind it.
 *
 * Filed under `/goal` although upstream files it under `/api/me/pause/`: what
 * the runner is pausing is the plan built for their goal, and this is the route
 * the goal page calls. The upstream path is `userApi.pausePlan`'s business.
 *
 * The reason arrives as the wire value from the served `pause_types` list, not
 * as a label — labels are localised upstream and nothing may key off them.
 */
export const POST: RequestHandler = async ({ request, cookies }) => {
	const body = parseBody(pauseGoalSchema, await request.json());

	return json(
		await passthrough(() =>
			userApi.pausePlan(cookies, { type: body.type, extra_input: body.extraInput.trim() })
		)
	);
};
