import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { trainingApi } from '$lib/server/trenara';
import { parseBody, parseTrainingId, passthrough } from '$lib/server/trenara/request';
import { setShoeSchema } from '$lib/schemas/training';

/** Assign one of the user's shoes to this training. */
export const PUT: RequestHandler = async ({ params, request, cookies, locals }) => {
	if (!locals.user) error(401, 'Unauthorized');

	const id = parseTrainingId(params.id);
	const body = parseBody(setShoeSchema, await request.json());

	return json(await passthrough(() => trainingApi.setSuggestedShoe(cookies, id, body.shoeId)));
};
