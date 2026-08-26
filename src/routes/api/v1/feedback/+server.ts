import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { trainingApi } from '$lib/server/trenara';
import { parseBody, passthrough } from '$lib/server/trenara/request';
import { rpeFeedbackSchema } from '$lib/schemas/feedback';

/**
 * Rate how hard a finished session felt.
 *
 * The upstream answer is passed straight back: the caller uses it to check
 * that the rating was actually recorded rather than assuming a 2xx meant it
 * was. Errors go through `passthrough` like every other write, so a refusal
 * keeps its own status and names the field it refused.
 */
export const PUT: RequestHandler = async ({ request, cookies, locals }) => {
	if (!locals.user) error(401, 'Unauthorized');

	const { entryId, feedback } = parseBody(rpeFeedbackSchema, await request.json());

	return json(await passthrough(() => trainingApi.putFeedback(cookies, entryId, feedback)));
};
