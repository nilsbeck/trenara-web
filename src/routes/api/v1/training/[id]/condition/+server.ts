import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { trainingApi } from '$lib/server/trenara';
import { parseBody, parseTrainingId, passthrough } from '$lib/server/trenara/request';
import { trainingConditionSchema } from '$lib/schemas/training';

/** Set the surface and elevation for one training. Both go up together. */
export const POST: RequestHandler = async ({ params, request, cookies, locals }) => {
	if (!locals.user) error(401, 'Unauthorized');

	const id = parseTrainingId(params.id);
	const body = parseBody(trainingConditionSchema, await request.json());

	return json(await passthrough(() => trainingApi.setTrainingCondition(cookies, id, body)));
};
