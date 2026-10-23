import type { RequestHandler } from './$types';
import { parseBody } from '#lib/server/trenara/request.js';
import { newsReadStateDAO } from '#lib/server/db/news-read-state.js';
import { fromStorage, STORAGE_WRITE_MESSAGE } from '#lib/server/db/errors.js';
import { clearBadgeCache } from '#lib/server/news/badge.js';
import { newsMarkReadSchema } from '#lib/schemas/news.js';
import { requireUser } from '#lib/server/auth/guard.js';

/**
 * Mark the news feed read up to the item in the body.
 *
 * Posted by the feed once it has rendered, not by its loader: a page that
 * failed on the way to the reader has not been read, and clearing the badge
 * for it would lose the item silently.
 *
 * The reader is `locals.user`, resolved from the access token in
 * `hooks.server.ts`, never a field in
 * the body — a mark is per-user state and must not be writable for anyone else.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	const user = requireUser(locals);
	const body = parseBody(newsMarkReadSchema, await request.json());

	const result = await fromStorage(
		() =>
			newsReadStateDAO.advanceMark(user.id, {
				id: body.lastSeenId,
				createdAt: body.lastSeenCreatedAt
			}),
		STORAGE_WRITE_MESSAGE
	);

	clearBadgeCache(user.id);

	return Response.json(result);
};
