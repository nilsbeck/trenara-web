import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { chatApi } from '$lib/server/trenara';
import { passthrough } from '$lib/server/trenara/request';

export const GET: RequestHandler = async ({ cookies }) => {
	return json(await passthrough(() => chatApi.getThreads(cookies)));
};
