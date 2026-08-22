import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { trainingApi } from '$lib/server/trenara';
import { parseTrainingId, passthrough } from '$lib/server/trenara/request';
import { setIntensitySchema } from '$lib/schemas/training';

/** Scale every pace in the training by a step from `change_intensity_package`. */
export const PUT: RequestHandler = async ({ params, request, cookies, locals }) => {
	if (!locals.user) error(401, 'Unauthorized');

	const id = parseTrainingId(params.id);
	const parsed = setIntensitySchema.safeParse(await request.json());
	if (!parsed.success) error(400, 'Invalid request body');

	return json(
		await passthrough(() => trainingApi.setIntensity(cookies, id, parsed.data.intensityValue))
	);
};
