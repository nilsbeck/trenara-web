import type { ChatMessage } from '$lib/server/trenara/types';

/**
 * Helpers for keeping the rendered message list consistent while a message is
 * in flight.
 *
 * Two things make this less trivial than pushing onto an array:
 *
 * 1. Trenara paginates messages and the captured payloads are newest-first,
 *    while the rendered list reads oldest-first. Rather than assume an order,
 *    these helpers detect it from the list itself and insert at the matching
 *    end.
 * 2. A message the user just sent has to show up immediately, but the next
 *    poll re-fetches the thread from the server. Until the server list
 *    contains it, the local copy has to survive the merge.
 */

/** Locally created messages get a negative id; the server never issues one. */
export function isPending(message: ChatMessage): boolean {
	return message.id < 0;
}

let pendingIdCounter = 0;

/** Builds the placeholder shown between pressing send and the server replying. */
export function createPendingMessage(body: string, userId: number | null): ChatMessage {
	return {
		id: -++pendingIdCounter,
		body,
		body_html: '',
		created_at: Math.floor(Date.now() / 1000),
		// Without a known user id the bubble falls back to "not a known
		// responder id means it is ours", which -1 satisfies.
		user_id: userId ?? -1
	};
}

/** True when the list runs oldest-first. An empty or single-item list counts as ascending. */
export function isAscending(messages: ChatMessage[]): boolean {
	if (messages.length < 2) return true;
	return messages[0].created_at <= messages[messages.length - 1].created_at;
}

/** Inserts a message at whichever end of the list holds the newest entries. */
export function withMessage(messages: ChatMessage[], message: ChatMessage): ChatMessage[] {
	return isAscending(messages) ? [...messages, message] : [message, ...messages];
}

/** Swaps a placeholder for the message the server confirmed, keeping its position. */
export function replaceMessage(
	messages: ChatMessage[],
	pendingId: number,
	saved: ChatMessage
): ChatMessage[] {
	return messages.map((message) => (message.id === pendingId ? saved : message));
}

export function removeMessage(messages: ChatMessage[], id: number): ChatMessage[] {
	return messages.filter((message) => message.id !== id);
}

/**
 * Takes the server list as the truth, but carries over any still-pending local
 * message the server has not caught up with yet. A pending message is
 * considered delivered once a message with the same body and author shows up.
 */
export function mergeFetched(fetched: ChatMessage[], current: ChatMessage[]): ChatMessage[] {
	const pending = current.filter(
		(message) =>
			isPending(message) &&
			!fetched.some((f) => f.body === message.body && f.user_id === message.user_id)
	);

	return pending.reduce(withMessage, fetched);
}

/** True once the server list holds a message we had not seen that is not ours. */
export function hasNewReply(
	fetched: ChatMessage[],
	knownIds: Set<number>,
	isOwn: (message: ChatMessage) => boolean
): boolean {
	return fetched.some((message) => !knownIds.has(message.id) && !isOwn(message));
}

/** Server-issued ids currently on screen, used as the baseline for reply detection. */
export function serverIds(messages: ChatMessage[]): Set<number> {
	return new Set(messages.filter((message) => !isPending(message)).map((message) => message.id));
}
