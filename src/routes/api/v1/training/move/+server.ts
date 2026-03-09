import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { trainingApi } from '$lib/server/trenara';
import { TokenType } from '$lib/server/auth/types';
import { HttpError } from '$lib/server/trenara/client';
import { changeDateSchema } from '$lib/schemas/training';

export const PUT: RequestHandler = async ({ request, cookies }) => {
	if (!cookies.get(TokenType.AccessToken)) {
		error(401, 'Unauthorized');
	}

	const body = await request.json();
	const result = changeDateSchema.safeParse(body);

	if (!result.success) {
		error(400, 'Invalid request body');
	}

	const { entryId, newDate, includeFuture, action } = result.data;

	try {
		if (action === 'test') {
			const data = await trainingApi.testChangeDate(cookies, entryId, newDate, includeFuture);
			return json(data);
		}

		const data = await trainingApi.saveChangeDate(cookies, entryId, newDate, includeFuture);
		return json(data);
	} catch (e) {
		if (e instanceof HttpError) {
			error(e.status, e.message);
		}
		throw e;
	}
};
