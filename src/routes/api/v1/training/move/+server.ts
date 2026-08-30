import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { trainingApi } from '$lib/server/trenara';
import { passthrough } from '$lib/server/trenara/request';
import { changeDateSchema } from '$lib/schemas/training';

export const PUT: RequestHandler = async ({ request, cookies }) => {
	const body = await request.json();
	const result = changeDateSchema.safeParse(body);

	if (!result.success) {
		error(400, 'Invalid request body');
	}

	const { entryId, newDate, includeFuture, action } = result.data;

	if (action === 'test') {
		return json(
			await passthrough(() => trainingApi.testChangeDate(cookies, entryId, newDate, includeFuture))
		);
	}

	return json(
		await passthrough(() => trainingApi.saveChangeDate(cookies, entryId, newDate, includeFuture))
	);
};
