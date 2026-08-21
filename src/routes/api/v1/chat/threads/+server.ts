import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { chatApi } from '$lib/server/trenara';

export const GET: RequestHandler = async ({ cookies, locals }) => {
	if (!locals.user) {
		error(401, 'Unauthorized');
	}

	const threads = await chatApi.getThreads(cookies);
	return json(threads);
};
