import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { trainingApi } from '$lib/server/trenara';
import { parseBody, passthrough } from '$lib/server/trenara/request';
import { rpeFeedbackSchema } from '$lib/schemas/feedback';

/**
 * Rate a completed session, 1–10.
 *
 * Answers with the updated `Entry` upstream returns — `rpe` set and
 * `ask_feedback` already `false` — so the caller can adopt the server's copy
 * rather than patch its own from what it sent.
 */
export const PUT: RequestHandler = async ({ request, cookies }) => {
	const { entryId, feedback } = parseBody(rpeFeedbackSchema, await request.json());

	return json(await passthrough(() => trainingApi.putFeedback(cookies, entryId, feedback)));
};
