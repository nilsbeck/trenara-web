import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { trainingApi } from '$lib/server/trenara';
import { parseBody, parseTrainingId, passthrough } from '$lib/server/trenara/request';
import { setCooldownSchema } from '$lib/schemas/training';

/** Add or remove the cool-down on a session that has one to drop. */
export const PUT: RequestHandler = async ({ params, request, cookies }) => {
	const id = parseTrainingId(params.id);
	const body = parseBody(setCooldownSchema, await request.json());

	return json(await passthrough(() => trainingApi.setCooldown(cookies, id, body.hasCooldown)));
};
