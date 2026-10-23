import type { RequestHandler } from './$types';
import { trainingApi } from '#lib/server/trenara/index.js';
import { parseBody, passthrough } from '#lib/server/trenara/request.js';
import { rpeFeedbackSchema } from '#lib/schemas/feedback.js';

/**
 * Rate a completed session, 1–10.
 *
 * Answers with the updated `Entry` upstream returns — `rpe` set and
 * `ask_feedback` already `false` — so the caller can adopt the server's copy
 * rather than patch its own from what it sent.
 */
export const PUT: RequestHandler = async ({ request, cookies }) => {
	const { entryId, feedback } = parseBody(rpeFeedbackSchema, await request.json());

	return Response.json(
		await passthrough(() => trainingApi.putFeedback(cookies, entryId, feedback))
	);
};
