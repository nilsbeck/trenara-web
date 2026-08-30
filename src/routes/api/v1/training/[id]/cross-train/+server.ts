import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { trainingApi } from '$lib/server/trenara';
import { parseBody, parseTrainingId, passthrough } from '$lib/server/trenara/request';
import { crossTrainSchema } from '$lib/schemas/training';

/** Swap the session to another activity, e.g. a bike ride. */
export const PUT: RequestHandler = async ({ params, request, cookies }) => {
	const id = parseTrainingId(params.id);
	const body = parseBody(crossTrainSchema, await request.json());

	return json(await passthrough(() => trainingApi.crossTrain(cookies, id, body.crossType)));
};
