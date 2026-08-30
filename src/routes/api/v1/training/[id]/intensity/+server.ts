import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { trainingApi } from '$lib/server/trenara';
import { parseBody, parseTrainingId, passthrough } from '$lib/server/trenara/request';
import { setIntensitySchema } from '$lib/schemas/training';

/** Scale every pace in the training by a step from `change_intensity_package`. */
export const PUT: RequestHandler = async ({ params, request, cookies }) => {
	const id = parseTrainingId(params.id);
	const body = parseBody(setIntensitySchema, await request.json());

	return json(await passthrough(() => trainingApi.setIntensity(cookies, id, body.intensityValue)));
};
