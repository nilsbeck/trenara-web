import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { newsApi } from '#lib/server/trenara/index.js';
import { passthrough } from '#lib/server/trenara/request.js';
import { newsPageSchema } from '#lib/schemas/news.js';

/** A page of the in-app news feed — ten items, newest first. */
export const GET: RequestHandler = async ({ url, cookies }) => {
	const parsed = newsPageSchema.safeParse(url.searchParams.get('page') ?? undefined);
	if (!parsed.success) error(400, 'Invalid page');

	return Response.json(await passthrough(() => newsApi.getNews(cookies, parsed.data)));
};
