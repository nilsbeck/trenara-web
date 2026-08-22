import { describe, it, expect } from 'vitest';
import type { ChatMessage } from '$lib/server/trenara/types';
import {
	createPendingMessage,
	hasNewReply,
	isPending,
	mergeFetched,
	removeMessage,
	replaceMessage,
	serverIds,
	toOldestFirst,
	withMessage
} from './message-list';

const COACH_ID = 3;
const ME = 56540;

function message(id: number, created_at: number, user_id = ME, body = `m${id}`): ChatMessage {
	return { id, body, body_html: `<p>${body}</p>`, created_at, user_id };
}

const isOwn = (m: ChatMessage) => m.user_id === ME;

describe('toOldestFirst', () => {
	// Trenara pages newest-first: page 1 is the ten most recent messages. The
	// bubble renders top-to-bottom and scrolls to the bottom, so the response
	// has to be flipped or the newest message ends up off-screen at the top.
	it('flips the newest-first response so the newest message is last', () => {
		const fetched = [message(3, 300), message(2, 200), message(1, 100)];
		expect(toOldestFirst(fetched).map((m) => m.id)).toEqual([1, 2, 3]);
	});

	it('leaves an already oldest-first list alone', () => {
		const fetched = [message(1, 100), message(2, 200)];
		expect(toOldestFirst(fetched).map((m) => m.id)).toEqual([1, 2]);
	});

	it('orders messages sent in the same second by id', () => {
		const fetched = [message(2, 100), message(1, 100)];
		expect(toOldestFirst(fetched).map((m) => m.id)).toEqual([1, 2]);
	});

	it('does not mutate the response', () => {
		const fetched = [message(2, 200), message(1, 100)];
		toOldestFirst(fetched);
		expect(fetched.map((m) => m.id)).toEqual([2, 1]);
	});

	it('handles an empty thread', () => {
		expect(toOldestFirst([])).toEqual([]);
	});
});

describe('withMessage', () => {
	it('adds to the newest end of the list', () => {
		const list = withMessage([message(1, 100), message(2, 200)], message(3, 300));
		expect(list.map((m) => m.id)).toEqual([1, 2, 3]);
	});

	it('does not mutate the input', () => {
		const original = [message(1, 100)];
		withMessage(original, message(2, 200));
		expect(original).toHaveLength(1);
	});
});

describe('createPendingMessage', () => {
	it('marks the message as pending with a unique negative id', () => {
		const first = createPendingMessage('hello', ME);
		const second = createPendingMessage('hello again', ME);

		expect(isPending(first)).toBe(true);
		expect(isPending(second)).toBe(true);
		expect(first.id).not.toBe(second.id);
		expect(first.user_id).toBe(ME);
		expect(first.body).toBe('hello');
	});

	it('falls back to an id no responder account uses when the user is unknown', () => {
		expect(createPendingMessage('hello', null).user_id).toBe(-1);
	});
});

describe('replaceMessage / removeMessage', () => {
	it('swaps the placeholder for the saved message in place', () => {
		const pending = createPendingMessage('question?', ME);
		const list = [message(1, 100), pending];
		const saved = message(9, 300, ME, 'question?');

		expect(replaceMessage(list, pending.id, saved).map((m) => m.id)).toEqual([1, 9]);
	});

	it('drops a placeholder when sending failed', () => {
		const pending = createPendingMessage('question?', ME);
		expect(removeMessage([message(1, 100), pending], pending.id).map((m) => m.id)).toEqual([1]);
	});
});

describe('mergeFetched', () => {
	it('keeps a pending message the server has not returned yet', () => {
		const pending = createPendingMessage('what pace?', ME);
		const merged = mergeFetched([message(1, 100)], [message(1, 100), pending]);

		expect(merged.map((m) => m.body)).toEqual(['m1', 'what pace?']);
	});

	it('drops the pending copy once the server echoes it back', () => {
		const pending = createPendingMessage('what pace?', ME);
		const fetched = [message(1, 100), message(2, 200, ME, 'what pace?')];
		const merged = mergeFetched(fetched, [message(1, 100), pending]);

		expect(merged).toHaveLength(2);
		expect(merged.some(isPending)).toBe(false);
	});

	it('keeps the pending message at the newest end of the list', () => {
		const pending = createPendingMessage('what pace?', ME);
		const merged = mergeFetched([message(1, 100), message(2, 200)], [pending]);

		expect(merged[merged.length - 1].body).toBe('what pace?');
	});

	it('takes the server list as the truth for everything else', () => {
		const merged = mergeFetched([message(1, 100), message(2, 200)], [message(1, 100)]);
		expect(merged.map((m) => m.id)).toEqual([1, 2]);
	});
});

describe('hasNewReply', () => {
	const known = new Set([1, 2]);

	it('is false while only our own messages are new', () => {
		const fetched = [message(1, 100), message(2, 200), message(3, 300, ME)];
		expect(hasNewReply(fetched, known, isOwn)).toBe(false);
	});

	it('is true once an unseen message from someone else arrives', () => {
		const fetched = [message(1, 100), message(3, 300, COACH_ID)];
		expect(hasNewReply(fetched, known, isOwn)).toBe(true);
	});

	it('ignores replies that were already on screen', () => {
		const fetched = [message(1, 100), message(2, 200, COACH_ID)];
		expect(hasNewReply(fetched, known, isOwn)).toBe(false);
	});
});

describe('serverIds', () => {
	it('collects only server-issued ids', () => {
		const pending = createPendingMessage('draft', ME);
		expect(serverIds([message(1, 100), message(2, 200), pending])).toEqual(new Set([1, 2]));
	});
});
