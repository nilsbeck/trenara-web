import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { trainingApi } from '$lib/server/trenara';
import { passthrough } from '$lib/server/trenara/request';

export const GET: RequestHandler = async ({ url, cookies }) => {
	const timestamp = url.searchParams.get('timestamp');
	if (!timestamp) {
		error(400, 'Missing timestamp parameter');
	}

	return json(await passthrough(() => trainingApi.getNutrition(cookies, timestamp)));
};
