import type { RequestHandler } from './$types';
import { trainingApi } from '#lib/server/trenara/index.js';
import { parseTrainingId, passthrough, readBody } from '#lib/server/trenara/request.js';
import { exchangeTrainingSchema } from '#lib/schemas/training.js';

/** Alternative sessions Trenara will accept in place of this one. */
export const GET: RequestHandler = async ({ params, cookies }) => {
	const id = parseTrainingId(params.id);
	return Response.json(await passthrough(() => trainingApi.getExchangeOptions(cookies, id)));
};

/**
 * Replace the training with one of those candidates.
 *
 * The candidate id is not the training id: it comes from the GET above and
 * belongs to a different id space, which is why it is named separately.
 */
export const PUT: RequestHandler = async ({ params, request, cookies }) => {
	const id = parseTrainingId(params.id);
	const body = await readBody(exchangeTrainingSchema, request);

	return Response.json(
		await passthrough(() => trainingApi.exchangeTraining(cookies, id, body.candidateId))
	);
};
