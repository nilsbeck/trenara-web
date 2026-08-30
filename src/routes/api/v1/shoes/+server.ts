import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { userApi } from '$lib/server/trenara';
import { passthrough } from '$lib/server/trenara/request';

/** The user's shoe locker, for the session-setup shoe picker. */
export const GET: RequestHandler = async ({ cookies }) => {
	return json(await passthrough(() => userApi.getShoes(cookies)));
};
