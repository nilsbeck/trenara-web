import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { trainingApi } from '$lib/server/trenara';
import { parseTrainingId, passthrough } from '$lib/server/trenara/request';
import { crossTrainSchema } from '$lib/schemas/training';

/** Swap the session to another activity, e.g. a bike ride. */
export const PUT: RequestHandler = async ({ params, request, cookies, locals }) => {
	if (!locals.user) error(401, 'Unauthorized');

	const id = parseTrainingId(params.id);
	const parsed = crossTrainSchema.safeParse(await request.json());
	if (!parsed.success) error(400, 'Invalid request body');

	return json(await passthrough(() => trainingApi.crossTrain(cookies, id, parsed.data.crossType)));
};
