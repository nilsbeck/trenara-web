import type { RequestHandler } from './$types';
import { userApi } from '#lib/server/trenara/index.js';
import { passthrough } from '#lib/server/trenara/request.js';

/** The user's shoe locker, for the session-setup shoe picker. */
export const GET: RequestHandler = async ({ cookies }) => {
	return Response.json(await passthrough(() => userApi.getShoes(cookies)));
};
