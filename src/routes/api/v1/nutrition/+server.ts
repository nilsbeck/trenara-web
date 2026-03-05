import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { trainingApi } from '$lib/server/trenara';
import { TokenType } from '$lib/server/auth/types';

export const GET: RequestHandler = async ({ url, cookies }) => {
	if (!cookies.get(TokenType.AccessToken)) {
		error(401, 'Unauthorized');
	}

	const timestamp = url.searchParams.get('timestamp');
	if (!timestamp) {
		error(400, 'Missing timestamp parameter');
	}

	const data = await trainingApi.getNutrition(cookies, timestamp);
	return json(data);
};
