import type { RequestHandler } from './$types';
import { trainingApi } from '#lib/server/trenara/index.js';
import { passthrough, readBody } from '#lib/server/trenara/request.js';
import { changeDateSchema } from '#lib/schemas/training.js';

/**
 * Move a session to another day. `test` asks Trenara what the move would do
 * to the rest of the plan without making it; `save` makes it.
 */
export const PUT: RequestHandler = async ({ request, cookies }) => {
	const { entryId, newDate, includeFuture, action } = await readBody(changeDateSchema, request);

	if (action === 'test') {
		return Response.json(
			await passthrough(() => trainingApi.testChangeDate(cookies, entryId, newDate, includeFuture))
		);
	}

	return Response.json(
		await passthrough(() => trainingApi.saveChangeDate(cookies, entryId, newDate, includeFuture))
	);
};
