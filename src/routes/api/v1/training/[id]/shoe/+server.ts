import type { RequestHandler } from './$types';
import { trainingApi } from '#lib/server/trenara/index.js';
import { parseTrainingId, passthrough, readBody } from '#lib/server/trenara/request.js';
import { setShoeSchema } from '#lib/schemas/training.js';

/** Assign one of the user's shoes to this training. */
export const PUT: RequestHandler = async ({ params, request, cookies }) => {
	const id = parseTrainingId(params.id);
	const body = await readBody(setShoeSchema, request);

	return Response.json(
		await passthrough(() => trainingApi.setSuggestedShoe(cookies, id, body.shoeId))
	);
};
