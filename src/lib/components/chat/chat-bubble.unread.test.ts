import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/svelte';
import ChatBubble from './chat-bubble.svelte';
import type { ChatMessage, ChatThread } from '$lib/server/trenara/types';

const ME = 56540;
const COACH = 3;

function thread(id: number, unread: number, lastMessageId: number): ChatThread {
	return {
		id,
		type: 'coach',
		title: `Thread ${id}`,
		sub_title: 'Coach',
		total_messages: 10,
		unread_messages: unread,
		can_send_messages: true,
		disabled: false,
		last_message: {
			id: lastMessageId,
			body: 'Nice session',
			body_html: '<p>Nice session</p>',
			created_at: 1700000000,
			user_id: COACH,
			picture_url: ''
		}
	};
}

function message(id: number, user_id = COACH): ChatMessage {
	return { id, body: `m${id}`, body_html: `<p>m${id}</p>`, created_at: 1700000000 + id, user_id };
}

/** Serves the two endpoints the bubble talks to. */
function mockFetch(threads: () => ChatThread[], messages: Record<number, ChatMessage[]>) {
	const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
		const url = String(input);
		const messagesMatch = url.match(/\/api\/v1\/chat\/threads\/(\d+)\/messages$/);
		if (messagesMatch) {
			return new Response(JSON.stringify({ data: messages[Number(messagesMatch[1])] ?? [] }), {
				status: 200
			});
		}
		return new Response(JSON.stringify(threads()), { status: 200 });
	});
	vi.stubGlobal('fetch', fetchMock);
	return fetchMock;
}

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

describe('chat bubble unread badge', () => {
	it('shows nothing when no thread has unread messages', () => {
		mockFetch(() => [], {});
		render(ChatBubble, { currentUserId: ME, initialThreads: [thread(1, 0, 100)] });

		expect(screen.getByLabelText('Open chat')).toBeTruthy();
	});

	// The badge is decoration — the count it shows is spelled out on the button
	// itself so a screen reader gets it without reading the badge.
	it('totals the unread messages across threads', () => {
		mockFetch(() => [], {});
		render(ChatBubble, {
			currentUserId: ME,
			initialThreads: [thread(1, 2, 100), thread(2, 3, 200), thread(3, 0, 300)]
		});

		expect(screen.getByText('5')).toBeTruthy();
		expect(screen.getByLabelText('Open chat, 5 unread messages')).toBeTruthy();
	});

	it('says "message" for a single unread one', () => {
		mockFetch(() => [], {});
		render(ChatBubble, { currentUserId: ME, initialThreads: [thread(1, 1, 100)] });

		expect(screen.getByLabelText('Open chat, 1 unread message')).toBeTruthy();
	});

	it('caps the badge but not the spoken count', () => {
		mockFetch(() => [], {});
		render(ChatBubble, { currentUserId: ME, initialThreads: [thread(1, 42, 100)] });

		expect(screen.getByText('9+')).toBeTruthy();
		expect(screen.getByLabelText('Open chat, 42 unread messages')).toBeTruthy();
	});

	it('clears the badge once the reader has been shown the messages', async () => {
		const unread = thread(1, 2, 101);
		// The server keeps reporting the thread as unread; having shown the
		// messages is what clears the badge.
		mockFetch(() => [unread], { 1: [message(100), message(101)] });
		render(ChatBubble, { currentUserId: ME, initialThreads: [unread] });

		expect(screen.getByText('2')).toBeTruthy();

		// Open: the bubble jumps into the only thread and loads it.
		await fireEvent.click(screen.getByLabelText('Open chat, 2 unread messages'));
		await waitFor(() => expect(screen.getByText('m101')).toBeTruthy());

		// Close again — nothing is unread any more.
		await fireEvent.click(screen.getByLabelText('Close chat'));
		await waitFor(() => expect(screen.getByLabelText('Open chat')).toBeTruthy());
		expect(screen.queryByText('2')).toBeNull();
	});

	it('counts messages that arrive while the bubble sits closed', async () => {
		vi.useFakeTimers();
		let served = [thread(1, 0, 101)];
		mockFetch(() => served, { 1: [message(100), message(101)] });
		render(ChatBubble, { currentUserId: ME, initialThreads: served });

		expect(screen.getByLabelText('Open chat')).toBeTruthy();

		// A reply lands in the thread list; the closed bubble refreshes on a tick.
		served = [thread(1, 3, 104)];
		await vi.advanceTimersByTimeAsync(60_000);

		expect(screen.getByLabelText('Open chat, 3 unread messages')).toBeTruthy();
	});

	it('does not re-badge a thread the reader has already read', async () => {
		vi.useFakeTimers();
		const unread = thread(1, 2, 101);
		// Trenara may never clear its own counter, so a refresh keeps reporting
		// the thread as unread after it has been read here.
		mockFetch(() => [unread], { 1: [message(100), message(101)] });
		render(ChatBubble, { currentUserId: ME, initialThreads: [unread] });

		await fireEvent.click(screen.getByLabelText('Open chat, 2 unread messages'));
		await vi.advanceTimersByTimeAsync(0);
		expect(screen.getByText('m101')).toBeTruthy();

		await fireEvent.click(screen.getByLabelText('Close chat'));
		await vi.advanceTimersByTimeAsync(60_000);

		expect(screen.getByLabelText('Open chat')).toBeTruthy();
	});
});
