import type { ChatThread, ChatMessage } from '#lib/server/trenara/types.js';
import { describeError, describeResponse } from '#lib/utils/network.js';
import { loadSanitizer, type Sanitize } from '#lib/utils/sanitize.js';
import {
	createPendingMessage,
	hasNewReply,
	mergeFetched,
	removeMessage,
	replaceMessage,
	serverIds,
	toOldestFirst,
	withMessage
} from '#lib/components/chat/message-list.js';
import {
	formatUnreadBadge,
	totalUnread,
	withSeen,
	type SeenMessageIds
} from '#lib/components/chat/unread.js';

/**
 * Trenara generates the coach's reply asynchronously, so the POST only
 * confirms the runner's own message. The thread is polled for a short while
 * afterwards so the answer lands without the chat having to be reopened.
 */
const REPLY_POLL_INTERVAL_MS = 3000;
const REPLY_POLL_TIMEOUT_MS = 60000;

/**
 * Accounts Trenara posts replies from: the coach bot ("Walter") authors as
 * user id 3, and automated replies have been seen on id 0. Used only as a
 * fallback — a real user id is always the better signal.
 */
const RESPONDER_USER_IDS = [0, 3];

/**
 * The coach chat: the thread list, the open conversation, the unread badge
 * and everything that changes them.
 *
 * This all used to live in `chat-bubble.svelte`, which ran to seven hundred
 * lines of requests, timers and state around a button — logic that could only
 * be tested by mounting it and clicking (agents.md §4). It is a view-model
 * now: the bubble creates one and owns it, the lazily loaded window
 * (`chat-panel.svelte`) is handed it as a prop, and both only read it and call
 * its methods. Nothing here touches the DOM; the one timer that has to follow
 * the page's visibility stays in the bubble and calls `refreshThreads`.
 */
export class ChatStore {
	/**
	 * Read through a getter rather than copied, so the store goes on agreeing
	 * with the prop it came from.
	 */
	#currentUserId: () => number | null;

	constructor(currentUserId: () => number | null = () => null) {
		this.#currentUserId = currentUserId;
	}

	isOpen = $state(false);
	threads = $state<ChatThread[]>([]);
	selectedThread = $state<ChatThread | null>(null);
	messages = $state<ChatMessage[]>([]);
	loadingThreads = $state(false);
	loadingMessages = $state(false);
	error = $state<string | null>(null);

	draft = $state('');
	sending = $state(false);
	sendError = $state<string | null>(null);
	awaitingReply = $state(false);

	/**
	 * Newest message id the reader has actually been shown, per thread, seeded
	 * from what the server has stored for them. See `unread.ts` for why
	 * Trenara's own counter is not enough on its own.
	 */
	seenMessageIds = $state<SeenMessageIds>(new Map<number, number>());

	/**
	 * DOMPurify, once a conversation has actually been opened.
	 *
	 * It used to be a plain import in the bubble, which lives in the (app)
	 * layout — so ~27KB of sanitiser was in the layout chunk of every page,
	 * whether or not anyone ever opened the chat. It is only needed when a
	 * message carrying markup is about to be drawn, which is strictly after a
	 * thread has been opened.
	 *
	 * Until it has landed, a message with markup renders as its plain-text
	 * `body`. Nothing unsanitised is ever put in the document.
	 */
	sanitize = $state<Sanitize | null>(null);

	unreadCount = $derived(totalUnread(this.threads, this.seenMessageIds));
	unreadLabel = $derived(formatUnreadBadge(this.unreadCount));
	bubbleLabel = $derived(
		this.isOpen
			? 'Close chat'
			: this.unreadCount > 0
				? `Open chat, ${this.unreadCount} unread ${this.unreadCount === 1 ? 'message' : 'messages'}`
				: 'Open chat'
	);

	/**
	 * Only hide the composer when the thread explicitly forbids posting. No
	 * captured payload pins `can_send_messages` down, so a missing field must
	 * not silently turn the chat read-only again.
	 */
	canSendMessages = $derived(
		this.selectedThread != null &&
			this.selectedThread.can_send_messages !== false &&
			this.selectedThread.disabled !== true
	);

	/** Set once the store has a thread list it fetched itself, which outranks any seed. */
	#seedConsumed = false;
	#seenSeedConsumed = false;
	#replyPollTimer: ReturnType<typeof setInterval> | null = null;

	/**
	 * The thread list streamed in with the page, so the badge is right before
	 * the bubble has ever been opened.
	 *
	 * Taken once. The seed arrives after the bubble has mounted — it is a
	 * streamed promise the layout resolves — and one that resolves late must
	 * not overwrite a list the store has since fetched for itself.
	 */
	seedThreads(initial: ChatThread[]): void {
		if (this.#seedConsumed || initial.length === 0) return;
		this.#seedConsumed = true;
		this.threads = initial;
	}

	/**
	 * The reader's stored position in each thread, folded in rather than
	 * assigned: a thread read in this session is always at least as far along
	 * as the stored position.
	 */
	seedSeen(stored: Record<number, number>): void {
		const entries = Object.entries(stored);
		if (this.#seenSeedConsumed || entries.length === 0) return;
		this.#seenSeedConsumed = true;

		const merged = new Map(this.seenMessageIds);
		for (const [threadId, messageId] of entries) {
			const id = Number(threadId);
			const current = merged.get(id);
			if (current === undefined || messageId > current) {
				merged.set(id, messageId);
			}
		}
		this.seenMessageIds = merged;
	}

	/** Open the chat if it is closed and close it if it is open. */
	toggle(): void {
		if (this.isOpen) this.close();
		else this.open();
	}

	/**
	 * Open the chat on the conversation it was last showing, or the first one.
	 *
	 * Reopening picks up whatever arrived meanwhile without blanking the
	 * conversation already on screen behind a loading spinner.
	 */
	open(): void {
		if (this.isOpen) return;
		this.isOpen = true;

		// Started now, in parallel with the requests below, rather than with the
		// first page of messages: with no thread list in hand that page waits on
		// the list, and the sanitiser depends on neither. `loadSanitizer` shares
		// one load between callers, so the later call there costs nothing.
		void this.#ensureSanitizer();

		if (this.threads.length === 0) {
			void this.#fetchThreads();
		} else if (!this.selectedThread) {
			void this.selectThread(this.threads[0]);
		} else {
			void this.#catchUp(this.selectedThread);
		}
	}

	close(): void {
		this.isOpen = false;
		this.stopReplyPolling();
	}

	/**
	 * Badge upkeep only, for the bubble's slow tick while it is closed: a failed
	 * refresh means a stale count, which is not worth an error message over a
	 * closed bubble.
	 */
	async refreshThreads(): Promise<void> {
		try {
			this.threads = await this.#loadThreads();
		} catch {
			// The next tick retries.
		}
	}

	async selectThread(thread: ChatThread): Promise<void> {
		this.stopReplyPolling();
		this.selectedThread = thread;
		this.loadingMessages = true;
		this.error = null;
		this.sendError = null;
		try {
			this.messages = await this.#fetchMessages(thread.id);
			this.#markSeen(thread.id);
		} catch (e) {
			this.error = describeError(e, 'Could not load these messages.');
		} finally {
			this.loadingMessages = false;
		}
	}

	/**
	 * Post the draft.
	 *
	 * The question is shown straight away and taken off again if the post
	 * fails, with the draft put back so nothing typed is lost.
	 */
	async send(): Promise<void> {
		const text = this.draft.trim();
		const thread = this.selectedThread;
		if (!text || this.sending || !thread || !this.canSendMessages) return;

		this.sending = true;
		this.sendError = null;

		const pending = createPendingMessage(text, this.#currentUserId());
		this.messages = withMessage(this.messages, pending);
		this.draft = '';

		try {
			const res = await fetch(`/api/v1/chat/threads/${thread.id}/messages`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ content: text })
			});
			if (!res.ok) throw new Error(await describeResponse(res, 'Could not send your message.'));

			// Trenara returns the stored message, sometimes wrapped in a data
			// envelope. Fall back to the placeholder if it returns neither.
			const payload = await res.json().catch(() => null);
			const saved = payload?.data ?? payload;
			if (saved && typeof saved.id === 'number') {
				this.messages = replaceMessage(this.messages, pending.id, saved as ChatMessage);
			}

			this.#startReplyPolling(thread.id);
		} catch (e) {
			this.messages = removeMessage(this.messages, pending.id);
			this.draft = text;
			this.sendError = describeError(e, 'Could not send your message.');
		} finally {
			this.sending = false;
		}
	}

	stopReplyPolling(): void {
		if (this.#replyPollTimer !== null) {
			clearInterval(this.#replyPollTimer);
			this.#replyPollTimer = null;
		}
		this.awaitingReply = false;
	}

	/**
	 * A message is ours only when it carries our own user id. Everything else —
	 * the coach, automated replies — is a response.
	 *
	 * An arrow function, so the window can call it from a template without
	 * carrying `this` along.
	 */
	isOwnMessage = (message: ChatMessage): boolean => {
		const me = this.#currentUserId();
		if (me != null) return message.user_id === me;
		// Without a known user id there is only a guess: the known responder
		// accounts are replies and everything else is ours.
		return !RESPONDER_USER_IDS.includes(message.user_id);
	};

	async #loadThreads(): Promise<ChatThread[]> {
		const res = await fetch('/api/v1/chat/threads/');
		if (!res.ok) throw new Error(await describeResponse(res, 'Could not load your conversations.'));
		// Anything fetched here is newer than the seed.
		this.#seedConsumed = true;
		return await res.json();
	}

	async #fetchThreads(): Promise<void> {
		this.loadingThreads = true;
		this.error = null;
		try {
			this.threads = await this.#loadThreads();
			if (this.threads.length > 0 && !this.selectedThread) {
				await this.selectThread(this.threads[0]);
			}
		} catch (e) {
			this.error = describeError(e, 'Could not load your conversations.');
		} finally {
			this.loadingThreads = false;
		}
	}

	/**
	 * A page of the ten most recent messages, newest first upstream, returned
	 * oldest first. The sanitiser is fetched alongside rather than before, so it
	 * costs no extra wait on the way to a conversation.
	 */
	async #fetchMessages(threadId: number): Promise<ChatMessage[]> {
		const [res] = await Promise.all([
			fetch(`/api/v1/chat/threads/${threadId}/messages`),
			this.#ensureSanitizer()
		]);
		if (!res.ok) throw new Error(await describeResponse(res, 'Could not load these messages.'));
		const data = await res.json();
		return toOldestFirst(data.data ?? []);
	}

	async #ensureSanitizer(): Promise<void> {
		if (this.sanitize) return;
		try {
			this.sanitize = await loadSanitizer();
		} catch {
			// Left null, so every message falls back to its plain-text body.
		}
	}

	async #catchUp(thread: ChatThread): Promise<void> {
		try {
			const fetched = await this.#fetchMessages(thread.id);
			if (this.selectedThread?.id !== thread.id) return;
			this.messages = mergeFetched(fetched, this.messages);
			this.#markSeen(thread.id);
		} catch {
			// Keep what is on screen; sending or reopening retries.
		}
	}

	#startReplyPolling(threadId: number): void {
		this.stopReplyPolling();

		const knownIds = serverIds(this.messages);
		const deadline = Date.now() + REPLY_POLL_TIMEOUT_MS;
		this.awaitingReply = true;

		// Not `revalidation`: this poll runs only while the chat is open and a
		// reply is owed, and stops itself at REPLY_POLL_TIMEOUT_MS — it is bounded
		// by its deadline rather than by visibility.
		// eslint-disable-next-line no-restricted-syntax
		this.#replyPollTimer = setInterval(async () => {
			if (Date.now() > deadline) {
				this.stopReplyPolling();
				return;
			}
			try {
				const fetched = await this.#fetchMessages(threadId);
				// The reader may have switched threads while the request was out.
				if (this.selectedThread?.id !== threadId) {
					this.stopReplyPolling();
					return;
				}
				this.messages = mergeFetched(fetched, this.messages);
				this.#markSeen(threadId);
				if (hasNewReply(fetched, knownIds, this.isOwnMessage)) {
					this.stopReplyPolling();
				}
			} catch {
				// A failed poll is not worth surfacing; the next tick retries.
			}
		}, REPLY_POLL_INTERVAL_MS);
	}

	/**
	 * Everything on screen in this thread has now been read. Stored server-side
	 * as well as here, or the badge would return on the next page load.
	 */
	#markSeen(threadId: number): void {
		const before = this.seenMessageIds.get(threadId);
		this.seenMessageIds = withSeen(this.seenMessageIds, threadId, this.messages);

		const after = this.seenMessageIds.get(threadId);
		if (after === undefined || after === before) return;
		void this.#storeMark(threadId, after);
	}

	async #storeMark(threadId: number, lastSeenMessageId: number): Promise<void> {
		try {
			await fetch(`/api/v1/chat/threads/${threadId}/read`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ lastSeenMessageId })
			});
		} catch {
			// The badge is already right for this session; the next read retries.
		}
	}
}
