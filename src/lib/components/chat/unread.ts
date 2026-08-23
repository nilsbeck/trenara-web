import type { ChatMessage, ChatThread } from '$lib/server/trenara/types';

/**
 * Unread bookkeeping for the floating chat bubble.
 *
 * Trenara counts unread messages per thread (`ChatThread.unread_messages`), so
 * the total is mostly a sum. The complication is clearing it: it has never been
 * confirmed that reading a thread through `/api/threads/{id}/messages` resets
 * the server-side counter, and a badge that reappears on the next poll after
 * the user just read the conversation is worse than no badge at all.
 *
 * So the bubble keeps its own high-water mark per thread — the newest message
 * id it has actually shown the reader — and a thread only counts as unread when
 * the server reports unread messages *and* its newest message is one the reader
 * has not been shown. If Trenara does clear the counter, this simply never
 * disagrees with it.
 */

/** Thread id to the newest message id the reader has been shown in it. */
export type SeenMessageIds = ReadonlyMap<number, number>;

/**
 * How high the badge counts before it stops being a number. The bubble is
 * small and "a lot" is the only message a two-digit count carries anyway.
 */
export const UNREAD_BADGE_MAX = 9;

/** The newest server-issued message id in a list, or 0 when there is none. */
export function newestMessageId(messages: ChatMessage[]): number {
	return messages.reduce((newest, message) => {
		// Locally created placeholders carry a negative id and are ours anyway.
		return message.id > newest ? message.id : newest;
	}, 0);
}

/** Unread messages in one thread, discounting what the reader has already seen. */
export function threadUnread(thread: ChatThread, seen: SeenMessageIds): number {
	const count = thread.unread_messages ?? 0;
	if (count <= 0) return 0;

	const seenId = seen.get(thread.id);
	if (seenId === undefined) return count;

	const lastId = thread.last_message?.id;
	// No last message to compare against: the reader has had this thread open,
	// so trust that over a counter that may never have been cleared.
	if (lastId === undefined) return 0;

	return lastId > seenId ? count : 0;
}

/** Unread messages across every thread. */
export function totalUnread(threads: ChatThread[], seen: SeenMessageIds): number {
	return threads.reduce((total, thread) => total + threadUnread(thread, seen), 0);
}

/** The badge label, e.g. `3` or `9+`. Empty when there is nothing to show. */
export function formatUnreadBadge(count: number): string {
	if (count <= 0) return '';
	return count > UNREAD_BADGE_MAX ? `${UNREAD_BADGE_MAX}+` : `${count}`;
}

/** Records that the reader has been shown everything currently in a thread. */
export function withSeen(
	seen: SeenMessageIds,
	threadId: number,
	messages: ChatMessage[]
): Map<number, number> {
	const next = new Map(seen);
	const newest = newestMessageId(messages);
	const previous = next.get(threadId);
	// Never move the mark backwards: an empty or partial re-fetch must not
	// resurrect messages the reader has already been shown.
	if (previous === undefined || newest > previous) {
		next.set(threadId, newest);
	}
	return next;
}
