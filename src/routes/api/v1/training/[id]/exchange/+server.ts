import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { trainingApi } from '$lib/server/trenara';
import { parseTrainingId, passthrough } from '$lib/server/trenara/request';
import { exchangeTrainingSchema } from '$lib/schemas/training';

/** Alternative sessions Trenara will accept in place of this one. */
export const GET: RequestHandler = async ({ params, cookies, locals }) => {
	if (!locals.user) error(401, 'Unauthorized');

	const id = parseTrainingId(params.id);
	return json(await passthrough(() => trainingApi.getExchangeOptions(cookies, id)));
};

/**
 * Replace the training with one of those candidates.
 *
 * The candidate id is not the training id: it comes from the GET above and
 * belongs to a different id space, which is why it is named separately.
 */
export const PUT: RequestHandler = async ({ params, request, cookies, locals }) => {
	if (!locals.user) error(401, 'Unauthorized');

	const id = parseTrainingId(params.id);
	const parsed = exchangeTrainingSchema.safeParse(await request.json());
	if (!parsed.success) error(400, 'Invalid request body');

	return json(
		await passthrough(() => trainingApi.exchangeTraining(cookies, id, parsed.data.candidateId))
	);
};
