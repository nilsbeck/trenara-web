import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { trainingApi } from '$lib/server/trenara';
import { parseBody, passthrough } from '$lib/server/trenara/request';
import { changeDateSchema } from '$lib/schemas/training';

/**
 * Move a session to another day. `test` asks Trenara what the move would do
 * to the rest of the plan without making it; `save` makes it.
 */
export const PUT: RequestHandler = async ({ request, cookies }) => {
	const { entryId, newDate, includeFuture, action } = parseBody(
		changeDateSchema,
		await request.json()
	);

	if (action === 'test') {
		return json(
			await passthrough(() => trainingApi.testChangeDate(cookies, entryId, newDate, includeFuture))
		);
	}

	return json(
		await passthrough(() => trainingApi.saveChangeDate(cookies, entryId, newDate, includeFuture))
	);
};
