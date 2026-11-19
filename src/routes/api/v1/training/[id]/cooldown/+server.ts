import type { RequestHandler } from './$types';
import { trainingApi } from '#lib/server/trenara/index.js';
import { parseTrainingId, passthrough, readBody } from '#lib/server/trenara/request.js';
import { setCooldownSchema } from '#lib/schemas/training.js';

/** Add or remove the cool-down on a session that has one to drop. */
export const PUT: RequestHandler = async ({ params, request, cookies }) => {
	const id = parseTrainingId(params.id);
	const body = await readBody(setCooldownSchema, request);

	return Response.json(
		await passthrough(() => trainingApi.setCooldown(cookies, id, body.hasCooldown))
	);
};
