import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { userApi } from '$lib/server/trenara';
import { passthrough } from '$lib/server/trenara/request';

/** The user's shoe locker, for the session-setup shoe picker. */
export const GET: RequestHandler = async ({ cookies, locals }) => {
	if (!locals.user) error(401, 'Unauthorized');

	return json(await passthrough(() => userApi.getShoes(cookies)));
};
