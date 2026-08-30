import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { chatReadStateDAO } from '$lib/server/db/chat-read-state';
import { fromStorage, STORAGE_WRITE_MESSAGE } from '$lib/server/db/errors';

/**
 * Records how far the reader has got in a thread.
 *
 * The bubble posts this once it has actually shown the messages, which is what
 * clears the unread badge for good — Trenara's own counter does not budge when
 * a conversation is read through this app.
 */
export const POST: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user) {
		error(401, 'Unauthorized');
	}

	const threadId = Number(params.id);
	if (!Number.isFinite(threadId) || threadId <= 0) {
		error(400, 'Invalid thread ID');
	}

	const body = await request.json().catch(() => null);
	const lastSeenMessageId = Number(body?.lastSeenMessageId);
	if (!Number.isInteger(lastSeenMessageId) || lastSeenMessageId < 0) {
		error(400, 'Invalid last seen message ID');
	}

	const { advanced } = await fromStorage(
		() => chatReadStateDAO.advanceMark(locals.user!.id, threadId, lastSeenMessageId),
		STORAGE_WRITE_MESSAGE
	);
	return json({ advanced });
};
