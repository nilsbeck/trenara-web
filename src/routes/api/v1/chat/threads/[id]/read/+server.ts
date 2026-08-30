import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireUser } from '$lib/server/auth/guard';
import { chatApi } from '$lib/server/trenara';
import { chatReadStateDAO } from '$lib/server/db/chat-read-state';
import { fromStorage, STORAGE_WRITE_MESSAGE } from '$lib/server/db/errors';
import { storageWrites } from '$lib/server/security/rate-limit';

/**
 * Records how far the reader has got in a thread.
 *
 * The bubble posts this once it has actually shown the messages, which is what
 * clears the unread badge for good — Trenara's own counter does not budge when
 * a conversation is read through this app.
 *
 * The thread id is checked against the reader's own conversations before
 * anything is written. It used to be accepted as any positive integer, and the
 * row it writes is keyed on `(user_id, thread_id)` — so a loop over the
 * integers wrote a row per iteration, without limit, into a database on a free
 * tier. The check costs nothing now that the thread list is cached: it is the
 * same list the bubble was rendered from.
 */
export const POST: RequestHandler = async ({ params, request, cookies, locals }) => {
	const user = requireUser(locals);

	const threadId = Number(params.id);
	if (!Number.isInteger(threadId) || threadId <= 0) {
		error(400, 'Invalid thread ID');
	}

	const limit = storageWrites.check(`chat-read:${user.id}`);
	if (!limit.allowed) {
		error(429, 'Too many updates. Please slow down.');
	}

	const body = await request.json().catch(() => null);
	const lastSeenMessageId = Number(body?.lastSeenMessageId);
	if (!Number.isInteger(lastSeenMessageId) || lastSeenMessageId < 0) {
		error(400, 'Invalid last seen message ID');
	}

	// A thread the reader is not in is a 404 rather than a 403: whether some
	// other account has a thread with this id is not this caller's business.
	const threads = await chatApi.getThreads(cookies).catch(() => null);
	if (threads === null) {
		error(503, 'Your conversations could not be checked. Please try again.');
	}
	if (!threads.some((thread) => thread.id === threadId)) {
		error(404, 'No such conversation');
	}

	const { advanced } = await fromStorage(
		() => chatReadStateDAO.advanceMark(user.id, threadId, lastSeenMessageId),
		STORAGE_WRITE_MESSAGE
	);
	return json({ advanced });
};
