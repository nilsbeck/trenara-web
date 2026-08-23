import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { newsApi } from '$lib/server/trenara';
import { passthrough } from '$lib/server/trenara/request';
import { newsPageSchema } from '$lib/schemas/news';

/** A page of the in-app news feed — ten items, newest first. */
export const GET: RequestHandler = async ({ url, cookies, locals }) => {
	if (!locals.user) error(401, 'Unauthorized');

	const parsed = newsPageSchema.safeParse(url.searchParams.get('page') ?? undefined);
	if (!parsed.success) error(400, 'Invalid page');

	return json(await passthrough(() => newsApi.getNews(cookies, parsed.data)));
};
