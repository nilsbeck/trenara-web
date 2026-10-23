import type { RequestHandler } from './$types';
import { trainingApi } from '#lib/server/trenara/index.js';
import { parseBody, parseTrainingId, passthrough } from '#lib/server/trenara/request.js';
import { trainingConditionSchema } from '#lib/schemas/training.js';

/** Set the surface and elevation for one training. Both go up together. */
export const POST: RequestHandler = async ({ params, request, cookies }) => {
	const id = parseTrainingId(params.id);
	const body = parseBody(trainingConditionSchema, await request.json());

	return Response.json(
		await passthrough(() => trainingApi.setTrainingCondition(cookies, id, body))
	);
};
