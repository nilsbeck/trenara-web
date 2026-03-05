import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { chatApi } from '$lib/server/trenara';
import { TokenType } from '$lib/server/auth/types';

export const GET: RequestHandler = async ({ cookies }) => {
	if (!cookies.get(TokenType.AccessToken)) {
		error(401, 'Unauthorized');
	}

	const threads = await chatApi.getThreads(cookies);
	return json(threads);
};
