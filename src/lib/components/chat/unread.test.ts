import { describe, it, expect } from 'vitest';
import type { ChatMessage, ChatThread } from '$lib/server/trenara/types';
import {
	formatUnreadBadge,
	newestMessageId,
	threadUnread,
	totalUnread,
	UNREAD_BADGE_MAX,
	withSeen
} from './unread';

function thread(id: number, unread: number, lastMessageId?: number): ChatThread {
	return {
		id,
		type: 'coach',
		title: `Thread ${id}`,
		sub_title: '',
		total_messages: 10,
		unread_messages: unread,
		can_send_messages: true,
		disabled: false,
		last_message:
			lastMessageId === undefined
				? undefined
				: {
						id: lastMessageId,
						body: 'hi',
						body_html: '<p>hi</p>',
						created_at: 1700000000,
						user_id: 3,
						picture_url: ''
					}
	};
}

function message(id: number): ChatMessage {
	return { id, body: `m${id}`, body_html: `<p>m${id}</p>`, created_at: 1700000000, user_id: 3 };
}

describe('newestMessageId', () => {
	it('is 0 for an empty thread', () => {
		expect(newestMessageId([])).toBe(0);
	});

	it('takes the highest id regardless of order', () => {
		expect(newestMessageId([message(7), message(21), message(9)])).toBe(21);
	});

	it('ignores pending local messages, which carry a negative id', () => {
		expect(newestMessageId([message(4), { ...message(-1), id: -1 }])).toBe(4);
	});
});

describe('threadUnread', () => {
	const nothingSeen = new Map<number, number>();

	it('reports the server count for a thread the reader has never opened', () => {
		expect(threadUnread(thread(1, 3, 90), nothingSeen)).toBe(3);
	});

	it('is zero when the server reports nothing unread', () => {
		expect(threadUnread(thread(1, 0, 90), nothingSeen)).toBe(0);
	});

	// Trenara may or may not clear its own counter when a thread is read. The
	// bubble's own high-water mark is what stops a read thread from re-badging.
	it('is zero once the reader has been shown the newest message', () => {
		expect(threadUnread(thread(1, 3, 90), new Map([[1, 90]]))).toBe(0);
	});

	it('counts again when a message newer than the mark arrives', () => {
		expect(threadUnread(thread(1, 2, 91), new Map([[1, 90]]))).toBe(2);
	});

	it('does not clear a thread because another one was read', () => {
		expect(threadUnread(thread(2, 4, 90), new Map([[1, 90]]))).toBe(4);
	});

	it('trusts the reader over the counter when the thread has no last message', () => {
		expect(threadUnread(thread(1, 5), new Map([[1, 0]]))).toBe(0);
	});
});

describe('totalUnread', () => {
	it('is zero without threads', () => {
		expect(totalUnread([], new Map())).toBe(0);
	});

	it('sums across threads, leaving out the ones already read', () => {
		const threads = [thread(1, 2, 90), thread(2, 3, 40), thread(3, 0, 10)];
		expect(totalUnread(threads, new Map([[2, 40]]))).toBe(2);
	});
});

describe('formatUnreadBadge', () => {
	it('shows nothing when there is nothing unread', () => {
		expect(formatUnreadBadge(0)).toBe('');
		expect(formatUnreadBadge(-1)).toBe('');
	});

	it('shows the count itself up to the cap', () => {
		expect(formatUnreadBadge(1)).toBe('1');
		expect(formatUnreadBadge(UNREAD_BADGE_MAX)).toBe(`${UNREAD_BADGE_MAX}`);
	});

	it('caps larger counts', () => {
		expect(formatUnreadBadge(UNREAD_BADGE_MAX + 1)).toBe(`${UNREAD_BADGE_MAX}+`);
		expect(formatUnreadBadge(240)).toBe(`${UNREAD_BADGE_MAX}+`);
	});
});

describe('withSeen', () => {
	it('records the newest message shown in a thread', () => {
		expect(withSeen(new Map(), 1, [message(4), message(9)]).get(1)).toBe(9);
	});

	it('leaves other threads alone', () => {
		const seen = withSeen(new Map([[2, 5]]), 1, [message(9)]);
		expect(seen.get(2)).toBe(5);
	});

	it('does not move the mark backwards on a partial re-fetch', () => {
		expect(withSeen(new Map([[1, 9]]), 1, [message(4)]).get(1)).toBe(9);
		expect(withSeen(new Map([[1, 9]]), 1, []).get(1)).toBe(9);
	});

	it('does not mutate the map it was given', () => {
		const seen = new Map<number, number>();
		withSeen(seen, 1, [message(9)]);
		expect(seen.size).toBe(0);
	});
});
