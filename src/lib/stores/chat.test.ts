import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ChatMessage, ChatThread } from '#lib/server/trenara/types.js';
import { ChatStore } from './chat.svelte';

/** How many times the store asked for the sanitiser, which is otherwise the real one. */
const sanitizer = vi.hoisted(() => ({ loads: 0 }));
vi.mock('#lib/utils/sanitize.js', async (importOriginal) => {
	const real = await importOriginal<typeof import('#lib/utils/sanitize.js')>();
	return {
		...real,
		loadSanitizer: () => {
			sanitizer.loads++;
			return real.loadSanitizer();
		}
	};
});

/**
 * The chat's view-model, driven directly: no component is mounted, and what
 * is asserted is the state a view would draw from.
 */

const ME = 56540;
const COACH = 3;

function thread(id: number, unread = 0, lastMessageId = 100, extra: Partial<ChatThread> = {}) {
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
		},
		...extra
	} as ChatThread;
}

function message(id: number, user_id = COACH): ChatMessage {
	return { id, body: `m${id}`, body_html: `<p>m${id}</p>`, created_at: 1700000000 + id, user_id };
}

interface Server {
	threads: ChatThread[];
	/** Newest first, as Trenara pages them. */
	messages: Record<number, ChatMessage[]>;
	failThreads?: boolean;
	/** Leave the thread list unanswered, as a slow connection would. */
	holdThreads?: boolean;
	failSend?: boolean;
	sent: unknown[];
	marks: unknown[];
}

let server: Server;

function json(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), { status });
}

beforeEach(() => {
	sanitizer.loads = 0;
	server = { threads: [], messages: {}, sent: [], marks: [] };
	vi.stubGlobal(
		'fetch',
		vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = String(input);
			const read = url.match(/threads\/(\d+)\/read$/);
			if (read) {
				server.marks.push(JSON.parse(String(init?.body)));
				return json({ advanced: true });
			}
			const msgs = url.match(/threads\/(\d+)\/messages$/);
			if (msgs && init?.method === 'POST') {
				if (server.failSend) return json({ message: 'Trenara refused it' }, 422);
				const { content } = JSON.parse(String(init.body));
				server.sent.push(content);
				return json({ data: { ...message(500, ME), body: content } });
			}
			if (msgs) return json({ data: server.messages[Number(msgs[1])] ?? [] });
			if (server.holdThreads) return new Promise<Response>(() => {});
			if (server.failThreads) return json({ message: 'down' }, 502);
			return json(server.threads);
		})
	);
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

/** Lets every request the store has started settle. */
const settle = () => vi.waitFor(() => Promise.resolve());

describe('ChatStore — the badge', () => {
	it('takes the streamed thread list once, so a second seed changes nothing', () => {
		const chat = new ChatStore(() => ME);

		chat.seedThreads([thread(1, 2, 101)]);
		chat.seedThreads([thread(2, 9, 200)]);

		expect(chat.threads.map((t) => t.id)).toEqual([1]);
		expect(chat.unreadCount).toBe(2);
		expect(chat.bubbleLabel).toBe('Open chat, 2 unread messages');
	});

	it('lets a list it fetched itself outrank a seed that arrives late', async () => {
		server.threads = [thread(7)];
		const chat = new ChatStore(() => ME);

		await chat.refreshThreads();
		chat.seedThreads([thread(1, 4, 101)]);

		expect(chat.threads.map((t) => t.id)).toEqual([7]);
	});

	it('folds stored read positions in, keeping whichever is further along', () => {
		const chat = new ChatStore(() => ME);
		chat.seedThreads([thread(1, 2, 101)]);

		chat.seedSeen({ 1: 101 });

		expect(chat.unreadCount).toBe(0);
		expect(chat.unreadLabel).toBe('');
		expect(chat.bubbleLabel).toBe('Open chat');
	});

	it('says "message" for one', () => {
		const chat = new ChatStore(() => ME);
		chat.seedThreads([thread(1, 1, 101)]);

		expect(chat.bubbleLabel).toBe('Open chat, 1 unread message');
	});
});

describe('ChatStore — opening a conversation', () => {
	it('fetches the threads, opens the first, and stores how far the reader got', async () => {
		server.threads = [thread(1, 2, 101)];
		server.messages = { 1: [message(101), message(100)] };
		const chat = new ChatStore(() => ME);

		chat.open();
		expect(chat.isOpen).toBe(true);
		expect(chat.bubbleLabel).toBe('Close chat');
		await vi.waitFor(() => expect(chat.messages.map((m) => m.id)).toEqual([100, 101]));

		expect(chat.selectedThread?.id).toBe(1);
		expect(chat.loadingThreads).toBe(false);
		expect(chat.loadingMessages).toBe(false);
		await vi.waitFor(() => expect(server.marks).toEqual([{ lastSeenMessageId: 101 }]));
		expect(chat.unreadCount).toBe(0);
	});

	it('says why when the threads cannot be loaded, rather than spinning', async () => {
		server.failThreads = true;
		const chat = new ChatStore(() => ME);

		chat.open();

		await vi.waitFor(() => expect(chat.error).not.toBeNull());
		expect(chat.loadingThreads).toBe(false);
		expect(chat.selectedThread).toBeNull();
	});

	/**
	 * Opening with no thread list in hand is two requests in a row — the list,
	 * then the first thread's messages — and the sanitiser used to wait for
	 * the first of them, starting only alongside the second. It depends on
	 * neither, so it starts the moment the chat is opened.
	 */
	it('starts loading the sanitiser while the thread list is still on its way', () => {
		server.holdThreads = true;
		const chat = new ChatStore(() => ME);

		chat.open();

		expect(chat.loadingThreads).toBe(true);
		expect(sanitizer.loads).toBe(1);
	});

	it('loads the sanitiser with the first messages, not before', async () => {
		server.threads = [thread(1)];
		server.messages = { 1: [message(100)] };
		const chat = new ChatStore(() => ME);
		expect(chat.sanitize).toBeNull();

		chat.open();

		await vi.waitFor(() => expect(chat.sanitize).not.toBeNull());
	});
});

describe('ChatStore — sending', () => {
	async function opened(extra: Partial<ChatThread> = {}) {
		server.threads = [thread(1, 0, 100, extra)];
		server.messages = { 1: [message(100)] };
		const chat = new ChatStore(() => ME);
		chat.open();
		await vi.waitFor(() => expect(chat.messages).toHaveLength(1));
		await settle();
		return chat;
	}

	it('shows the question at once and swaps in the stored copy', async () => {
		const chat = await opened();
		chat.draft = '  How far on Sunday?  ';

		const sent = chat.send();
		expect(chat.draft).toBe('');
		expect(chat.messages.at(-1)?.body).toBe('How far on Sunday?');
		await sent;

		expect(server.sent).toEqual(['How far on Sunday?']);
		expect(chat.messages.at(-1)?.id).toBe(500);
		expect(chat.sending).toBe(false);
		expect(chat.awaitingReply).toBe(true);
		chat.close();
	});

	it('takes the question back and keeps the draft when the post fails', async () => {
		const chat = await opened();
		server.failSend = true;
		chat.draft = 'Can I swap Tuesday?';

		await chat.send();

		expect(chat.messages.map((m) => m.id)).toEqual([100]);
		expect(chat.draft).toBe('Can I swap Tuesday?');
		expect(chat.sendError).toContain('Trenara refused it');
		expect(chat.awaitingReply).toBe(false);
	});

	it('stops waiting once the coach has answered', async () => {
		const chat = await opened();
		vi.useFakeTimers();
		chat.draft = 'Hello';
		await chat.send();
		expect(chat.awaitingReply).toBe(true);

		// The coach's reply lands upstream; the next poll picks it up.
		server.messages = { 1: [message(501), message(500, ME), message(100)] };
		await vi.advanceTimersByTimeAsync(3000);

		expect(chat.awaitingReply).toBe(false);
		expect(chat.messages.map((m) => m.id)).toEqual([100, 500, 501]);
	});

	it('stops waiting when the chat is closed', async () => {
		const chat = await opened();
		chat.draft = 'Hello';
		await chat.send();

		chat.close();

		expect(chat.awaitingReply).toBe(false);
		expect(chat.isOpen).toBe(false);
	});

	it('sends nothing into a thread that is read-only', async () => {
		const chat = await opened({ can_send_messages: false });
		chat.draft = 'Hello?';

		await chat.send();

		expect(chat.canSendMessages).toBe(false);
		expect(server.sent).toEqual([]);
		expect(chat.draft).toBe('Hello?');
	});
});

describe('ChatStore — whose message is whose', () => {
	it('goes by the reader’s id when it is known', () => {
		const chat = new ChatStore(() => ME);
		expect(chat.isOwnMessage(message(1, ME))).toBe(true);
		expect(chat.isOwnMessage(message(2, 0))).toBe(false);
	});

	it('falls back to the known responder accounts when it is not', () => {
		const chat = new ChatStore(() => null);
		expect(chat.isOwnMessage(message(1, COACH))).toBe(false);
		expect(chat.isOwnMessage(message(2, 0))).toBe(false);
		expect(chat.isOwnMessage(message(3, 1234))).toBe(true);
	});
});
