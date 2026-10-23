import type { RequestHandler } from './$types';
import { chatApi } from '#lib/server/trenara/index.js';
import { passthrough } from '#lib/server/trenara/request.js';

export const GET: RequestHandler = async ({ cookies }) => {
	return Response.json(await passthrough(() => chatApi.getThreads(cookies)));
};
