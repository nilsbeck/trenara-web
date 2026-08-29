import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { trainingApi } from '$lib/server/trenara';
import { passthrough } from '$lib/server/trenara/request';

export const GET: RequestHandler = async ({ url, cookies, locals }) => {
	if (!locals.user) {
		error(401, 'Unauthorized');
	}

	const timestamp = url.searchParams.get('timestamp');
	if (!timestamp) {
		error(400, 'Missing timestamp parameter');
	}

	return json(await passthrough(() => trainingApi.getNutrition(cookies, timestamp)));
};
