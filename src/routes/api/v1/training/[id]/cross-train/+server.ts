import type { RequestHandler } from './$types';
import { trainingApi } from '#lib/server/trenara/index.js';
import { parseTrainingId, passthrough, readBody } from '#lib/server/trenara/request.js';
import { crossTrainSchema } from '#lib/schemas/training.js';

/** Swap the session to another activity, e.g. a bike ride. */
export const PUT: RequestHandler = async ({ params, request, cookies }) => {
	const id = parseTrainingId(params.id);
	const body = await readBody(crossTrainSchema, request);

	return Response.json(
		await passthrough(() => trainingApi.crossTrain(cookies, id, body.crossType))
	);
};
