import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { chatApi } from '$lib/server/trenara';
import { passthrough } from '$lib/server/trenara/request';

export const GET: RequestHandler = async ({ cookies, locals }) => {
	if (!locals.user) {
		error(401, 'Unauthorized');
	}

	return json(await passthrough(() => chatApi.getThreads(cookies)));
};
