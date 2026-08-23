import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { newsReadStateDAO } from '$lib/server/db/news-read-state';
import { clearBadgeCache } from '$lib/server/news/badge';
import { newsMarkReadSchema } from '$lib/schemas/news';

/**
 * Mark the news feed read up to the item in the body.
 *
 * Posted by the feed once it has rendered, not by its loader: a page that
 * failed on the way to the reader has not been read, and clearing the badge
 * for it would lose the item silently.
 *
 * The reader is `locals.user`, verified in `hooks.server.ts`, never a field in
 * the body — a mark is per-user state and must not be writable for anyone else.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) error(401, 'Unauthorized');

	const parsed = newsMarkReadSchema.safeParse(await request.json());
	if (!parsed.success) error(400, 'Invalid request body');

	const result = await newsReadStateDAO.advanceMark(locals.user.id, {
		id: parsed.data.lastSeenId,
		createdAt: parsed.data.lastSeenCreatedAt
	});

	clearBadgeCache(locals.user.id);

	return json(result);
};
