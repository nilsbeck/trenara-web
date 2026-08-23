import type { Cookies } from '@sveltejs/kit';
import { chatApi } from '$lib/server/trenara';
import { chatReadStateDAO } from '$lib/server/db/chat-read-state';
import type { ChatThread } from '$lib/server/trenara/types';

/**
 * What the chat bubble needs to show an unread badge before it is opened:
 * the thread list, and how far the reader has got in each thread.
 */
export interface ChatBadgeData {
	threads: ChatThread[];
	/** Thread id to the newest message id the reader has been shown. */
	seen: Record<number, number>;
}

const EMPTY: ChatBadgeData = { threads: [], seen: {} };

/** The newest message id known for a thread, or 0 when it has none. */
function newestOf(thread: ChatThread): number {
	return thread.last_message?.id ?? 0;
}

/**
 * Thread list and read marks for the bubble's badge.
 *
 * A thread the reader has never been seen in is seeded to whatever is newest
 * in it right now and reported as read. Trenara's `unread_messages` does not
 * clear when a conversation is read through this app, so without seeding every
 * reader would be greeted by a badge for conversations they finished long ago —
 * the same reasoning as the news badge, and the same cost: a reply that arrived
 * before their first load of this feature does not raise a badge.
 *
 * Errors are not the page's problem. Chat unreachable, database down: the
 * bubble comes back empty, shows no badge, and still loads its threads itself
 * when opened.
 */
export async function loadChatBadge(cookies: Cookies, userId: number): Promise<ChatBadgeData> {
	try {
		const [threads, marks] = await Promise.all([
			chatApi.getThreads(cookies),
			chatReadStateDAO.getMarks(userId)
		]);

		const unseen = threads.filter((thread) => !marks.has(thread.id));
		await Promise.all(
			unseen.map((thread) => chatReadStateDAO.advanceMark(userId, thread.id, newestOf(thread)))
		);

		const seen: Record<number, number> = {};
		for (const thread of threads) {
			seen[thread.id] = marks.get(thread.id) ?? newestOf(thread);
		}

		return { threads, seen };
	} catch (e) {
		console.error('Failed to load chat badge:', e instanceof Error ? e.message : e);
		return EMPTY;
	}
}
