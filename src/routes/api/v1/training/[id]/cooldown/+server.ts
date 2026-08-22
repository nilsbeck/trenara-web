import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { trainingApi } from '$lib/server/trenara';
import { parseTrainingId, passthrough } from '$lib/server/trenara/request';
import { setCooldownSchema } from '$lib/schemas/training';

/** Add or remove the cool-down on a session that has one to drop. */
export const PUT: RequestHandler = async ({ params, request, cookies, locals }) => {
	if (!locals.user) error(401, 'Unauthorized');

	const id = parseTrainingId(params.id);
	const parsed = setCooldownSchema.safeParse(await request.json());
	if (!parsed.success) error(400, 'Invalid request body');

	return json(
		await passthrough(() => trainingApi.setCooldown(cookies, id, parsed.data.hasCooldown))
	);
};
