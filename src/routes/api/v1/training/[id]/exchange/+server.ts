import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { trainingApi } from '$lib/server/trenara';
import { parseBody, parseTrainingId, passthrough } from '$lib/server/trenara/request';
import { exchangeTrainingSchema } from '$lib/schemas/training';

/** Alternative sessions Trenara will accept in place of this one. */
export const GET: RequestHandler = async ({ params, cookies }) => {
	const id = parseTrainingId(params.id);
	return json(await passthrough(() => trainingApi.getExchangeOptions(cookies, id)));
};

/**
 * Replace the training with one of those candidates.
 *
 * The candidate id is not the training id: it comes from the GET above and
 * belongs to a different id space, which is why it is named separately.
 */
export const PUT: RequestHandler = async ({ params, request, cookies }) => {
	const id = parseTrainingId(params.id);
	const body = parseBody(exchangeTrainingSchema, await request.json());

	return json(await passthrough(() => trainingApi.exchangeTraining(cookies, id, body.candidateId)));
};
