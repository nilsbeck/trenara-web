import type { RequestHandler } from './$types';
import { trainingApi } from '#lib/server/trenara/index.js';
import { parseBody, parseTrainingId, passthrough } from '#lib/server/trenara/request.js';
import { setDistanceSchema } from '#lib/schemas/training.js';

/** Scale the training's volume by a step from `change_distance_package`. */
export const PUT: RequestHandler = async ({ params, request, cookies }) => {
	const id = parseTrainingId(params.id);
	const body = parseBody(setDistanceSchema, await request.json());

	return Response.json(
		await passthrough(() => trainingApi.setDistance(cookies, id, body.distanceValue))
	);
};
