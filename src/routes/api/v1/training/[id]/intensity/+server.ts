import type { RequestHandler } from './$types';
import { trainingApi } from '#lib/server/trenara/index.js';
import { parseTrainingId, passthrough, readBody } from '#lib/server/trenara/request.js';
import { setIntensitySchema } from '#lib/schemas/training.js';

/** Scale every pace in the training by a step from `change_intensity_package`. */
export const PUT: RequestHandler = async ({ params, request, cookies }) => {
	const id = parseTrainingId(params.id);
	const body = await readBody(setIntensitySchema, request);

	return Response.json(
		await passthrough(() => trainingApi.setIntensity(cookies, id, body.intensityValue))
	);
};
