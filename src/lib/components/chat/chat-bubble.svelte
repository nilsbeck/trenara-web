<script module lang="ts">
	import { loadOnce } from '#lib/utils/load-once.js';

	/**
	 * The open chat window, fetched rather than shipped with every page.
	 *
	 * The bubble lives in the (app) layout, so everything it imports statically
	 * is in the shell every signed-in page downloads before it can hydrate —
	 * and the window behind it, thread list, conversation and composer, was
	 * most of that, for a conversation most visits never open. The bubble and
	 * its badge stay here, drawn in the first paint; the window is warmed once
	 * the page is idle and mounted on the first tap, the same arrangement as the
	 * session card's dialogs (`change-date-modal.svelte`).
	 */
	const loadPanel = loadOnce(() => import('./chat-panel.svelte'));
</script>

<script lang="ts">
	import type { ChatThread, ChatMessage } from '#lib/server/trenara/types.js';
	import { MessageCircle, X, Loader2 } from '@lucide/svelte';
	import { onDestroy } from 'svelte';
	import { reloadOnStaleChunk, whenIdle } from '#lib/utils/load-once.js';
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
	} from './message-list';
	import { formatUnreadBadge, totalUnread, withSeen, type SeenMessageIds } from './unread';

	let {
		currentUserId = null,
		initialThreads = [],
		initialSeen = {}
	}: {
		currentUserId?: number | null;
		/**
		 * Threads streamed in with the page, so the unread badge is right before
		 * the bubble has been opened. Client refreshes take over from there.
		 */
		initialThreads?: ChatThread[];
		/**
		 * The reader's stored position in each thread, keyed by thread id. Read
		 * state has to outlive the page: Trenara's own unread count does not
		 * clear when a conversation is read here, so without this the badge
		 * would come back on every refresh.
		 */
		initialSeen?: Record<number, number>;
	} = $props();

	let isOpen = $state(false);
	let threads = $state<ChatThread[]>([]);
	let selectedThread = $state<ChatThread | null>(null);
	let messages = $state<ChatMessage[]>([]);
	let loadingThreads = $state(false);
	let loadingMessages = $state(false);
	let error = $state<string | null>(null);

	// Newest message id the reader has actually been shown, per thread, seeded
	// from what the server has stored for them. See ./unread for why Trenara's
	// own counter is not enough on its own.
	let seenMessageIds = $state<SeenMessageIds>(new Map<number, number>());
	const unreadCount = $derived(totalUnread(threads, seenMessageIds));
	const unreadLabel = $derived(formatUnreadBadge(unreadCount));
	const bubbleLabel = $derived(
		isOpen
			? 'Close chat'
			: unreadCount > 0
				? `Open chat, ${unreadCount} unread ${unreadCount === 1 ? 'message' : 'messages'}`
				: 'Open chat'
	);

	let draft = $state('');
	let sending = $state(false);
	let sendError = $state<string | null>(null);
	let awaitingReply = $state(false);

	/**
	 * DOMPurify, once the bubble has actually been opened.
	 *
	 * It used to be a plain import, and this component lives in the (app)
	 * layout — so ~27KB of sanitiser was in the layout chunk of every page,
	 * loaded whether or not anyone ever tapped the bubble. It is only needed
	 * when a message carrying markup is about to be drawn, which is strictly
	 * after the bubble is open.
	 *
	 * Until it has landed, a message with markup renders as its plain-text
	 * `body`. Nothing unsanitised is ever put in the document.
	 */
	let sanitize = $state<Sanitize | null>(null);

	async function ensureSanitizer(): Promise<void> {
		if (sanitize) return;
		try {
			sanitize = await loadSanitizer();
		} catch {
			// Left null, so every message falls back to its plain-text body.
		}
	}

	let Panel = $state<typeof import('./chat-panel.svelte').default | null>(null);

	// Warming a chunk is syncing with the network, not deriving state.
	$effect(() => whenIdle(() => void loadPanel().catch(() => {})));

	/**
	 * Mount the window, loading it first if the idle warm-up has not already.
	 *
	 * Started alongside the thread and message requests rather than before
	 * them, so a tap that beats the warm-up waits for the slower of the two
	 * instead of for both in turn. A load that fails on a tap is almost always
	 * a deploy that has taken the old chunk away, and a reload is what fixes it.
	 */
	async function openPanel() {
		if (Panel) return;
		try {
			Panel = (await loadPanel()).default;
		} catch (error) {
			reloadOnStaleChunk(error);
		}
	}

	// Trenara generates the coach reply asynchronously, so the POST only
	// confirms our own message. Poll the thread for a short while afterwards so
	// the answer lands without the user having to reopen the chat.
	const REPLY_POLL_INTERVAL_MS = 3000;
	const REPLY_POLL_TIMEOUT_MS = 60000;
	let replyPollTimer: ReturnType<typeof setInterval> | null = null;

	// The badge has to stay honest on a page that is left open all morning, so
	// the thread list is refreshed on a slow tick while the bubble is closed.
	const THREAD_POLL_INTERVAL_MS = 60000;

	// Only hide the composer when the thread explicitly forbids posting. No
	// captured payload pins `can_send_messages` down, so a missing field must
	// not silently turn the chat read-only again.
	const canSendMessages = $derived(
		selectedThread != null &&
			selectedThread.can_send_messages !== false &&
			selectedThread.disabled !== true
	);

	async function loadThreads(): Promise<ChatThread[]> {
		const res = await fetch('/api/v1/chat/threads/');
		if (!res.ok) throw new Error(await describeResponse(res, 'Could not load your conversations.'));
		// Anything the bubble fetched itself is newer than the seed below.
		seedConsumed = true;
		return await res.json();
	}

	async function fetchThreads() {
		loadingThreads = true;
		error = null;
		try {
			threads = await loadThreads();
			if (threads.length > 0 && !selectedThread) {
				await selectThread(threads[0]);
			}
		} catch (e) {
			error = describeError(e, 'Could not load your conversations.');
		} finally {
			loadingThreads = false;
		}
	}

	// Badge upkeep only: a failed refresh means a stale count, which is not
	// worth an error message over the closed bubble.
	async function refreshThreads() {
		try {
			threads = await loadThreads();
		} catch {
			// The next tick retries.
		}
	}

	// A page holds the ten most recent messages, newest first; the list below
	// reads oldest-first.
	async function fetchMessages(threadId: number): Promise<ChatMessage[]> {
		// The sanitiser is fetched alongside the messages rather than before
		// them, so it costs no extra wait on the way to a conversation.
		const [res] = await Promise.all([
			fetch(`/api/v1/chat/threads/${threadId}/messages`),
			ensureSanitizer()
		]);
		if (!res.ok) throw new Error(await describeResponse(res, 'Could not load these messages.'));
		const data = await res.json();
		return toOldestFirst(data.data ?? []);
	}

	async function selectThread(thread: ChatThread) {
		stopReplyPolling();
		selectedThread = thread;
		loadingMessages = true;
		error = null;
		sendError = null;
		try {
			messages = await fetchMessages(thread.id);
			markSeen(thread.id);
		} catch (e) {
			error = describeError(e, 'Could not load these messages.');
		} finally {
			loadingMessages = false;
		}
	}

	async function send() {
		const text = draft.trim();
		const thread = selectedThread;
		if (!text || sending || !thread || !canSendMessages) return;

		sending = true;
		sendError = null;

		// Show the question straight away; drop it again if the post fails.
		const pending = createPendingMessage(text, currentUserId);
		messages = withMessage(messages, pending);
		draft = '';

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
				messages = replaceMessage(messages, pending.id, saved as ChatMessage);
			}

			startReplyPolling(thread.id);
		} catch (e) {
			messages = removeMessage(messages, pending.id);
			draft = text;
			sendError = describeError(e, 'Could not send your message.');
		} finally {
			sending = false;
		}
	}

	function startReplyPolling(threadId: number) {
		stopReplyPolling();

		const knownIds = serverIds(messages);
		const deadline = Date.now() + REPLY_POLL_TIMEOUT_MS;
		awaitingReply = true;

		// Not `revalidation`: this poll runs only while the bubble is open and a
		// reply is owed, and stops itself at REPLY_POLL_TIMEOUT_MS — it is bounded
		// by its deadline rather than by visibility.
		// eslint-disable-next-line no-restricted-syntax
		replyPollTimer = setInterval(async () => {
			if (Date.now() > deadline) {
				stopReplyPolling();
				return;
			}
			try {
				const fetched = await fetchMessages(threadId);
				// The user may have switched threads while the request was in flight.
				if (selectedThread?.id !== threadId) {
					stopReplyPolling();
					return;
				}
				messages = mergeFetched(fetched, messages);
				markSeen(threadId);
				if (hasNewReply(fetched, knownIds, isOwnMessage)) {
					stopReplyPolling();
				}
			} catch {
				// A failed poll is not worth surfacing; the next tick retries.
			}
		}, REPLY_POLL_INTERVAL_MS);
	}

	function stopReplyPolling() {
		if (replyPollTimer !== null) {
			clearInterval(replyPollTimer);
			replyPollTimer = null;
		}
		awaitingReply = false;
	}

	/**
	 * Everything on screen in this thread has now been read. Stored server-side
	 * as well as locally, or the badge would return on the next page load.
	 */
	function markSeen(threadId: number) {
		const before = seenMessageIds.get(threadId);
		seenMessageIds = withSeen(seenMessageIds, threadId, messages);

		const after = seenMessageIds.get(threadId);
		if (after === undefined || after === before) return;
		storeMark(threadId, after);
	}

	async function storeMark(threadId: number, lastSeenMessageId: number) {
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

	// Reopening should pick up whatever arrived meanwhile, without blanking the
	// conversation already on screen behind a loading spinner.
	async function catchUp(thread: ChatThread) {
		try {
			const fetched = await fetchMessages(thread.id);
			if (selectedThread?.id !== thread.id) return;
			messages = mergeFetched(fetched, messages);
			markSeen(thread.id);
		} catch {
			// Keep what is on screen; sending or reopening retries.
		}
	}

	function toggle() {
		isOpen = !isOpen;
		if (!isOpen) {
			stopReplyPolling();
			return;
		}
		void openPanel();
		if (threads.length === 0) {
			fetchThreads();
		} else if (!selectedThread) {
			selectThread(threads[0]);
		} else {
			catchUp(selectedThread);
		}
	}

	onDestroy(stopReplyPolling);

	// The thread list streamed in with the page seeds the badge, so it is right
	// before the bubble has ever been opened. A seed that resolves late must not
	// overwrite a list the bubble has since fetched for itself.
	let seedConsumed = false;
	$effect(() => {
		if (seedConsumed || initialThreads.length === 0) return;
		seedConsumed = true;
		threads = initialThreads;
	});

	// Stored read marks, folded in rather than assigned: a thread read in this
	// session is always at least as far along as the stored position.
	let seenSeedConsumed = false;
	$effect(() => {
		const stored = Object.entries(initialSeen);
		if (seenSeedConsumed || stored.length === 0) return;
		seenSeedConsumed = true;

		const merged = new Map(seenMessageIds);
		for (const [threadId, messageId] of stored) {
			const id = Number(threadId);
			const current = merged.get(id);
			if (current === undefined || messageId > current) {
				merged.set(id, messageId);
			}
		}
		seenMessageIds = merged;
	});

	/**
	 * Keeping the badge honest on a page left open all morning.
	 *
	 * An open bubble already polls the conversation it is showing, so this tick
	 * only runs while it is closed — and only while anyone is actually looking.
	 * It used to run regardless: a phone with the PWA in the background still
	 * spent a request a minute, every open tab its own timer, against a budget
	 * of sixty a minute shared with the whole app.
	 *
	 * A hidden tab is refreshed the moment it is looked at again instead, which
	 * is the only moment a badge being a minute stale could matter. The same
	 * reasoning, and the same shape, as `#lib/utils/revalidation.js`.
	 */
	$effect(() => {
		if (isOpen) return;

		let timer: ReturnType<typeof setInterval> | null = null;

		function stop() {
			if (timer !== null) clearInterval(timer);
			timer = null;
		}

		function start() {
			if (timer !== null) return;
			// Gated on visibility by `onVisibility` below — the same shape as
			// `revalidation`, written out because it also stops while the bubble is open.
			// eslint-disable-next-line no-restricted-syntax
			timer = setInterval(refreshThreads, THREAD_POLL_INTERVAL_MS);
		}

		function onVisibility() {
			if (document.visibilityState === 'visible') {
				refreshThreads();
				start();
			} else {
				stop();
			}
		}

		if (document.visibilityState === 'visible') start();
		document.addEventListener('visibilitychange', onVisibility);

		return () => {
			stop();
			document.removeEventListener('visibilitychange', onVisibility);
		};
	});

	// Accounts Trenara posts replies from: the coach bot ("Walter") authors as
	// user id 3, and automated replies have been seen on id 0. Used only as a
	// fallback — a real user id is always the better signal.
	const RESPONDER_USER_IDS = [0, 3];

	// A message is ours only when it carries our own user id. Everything else
	// (the coach, automated replies, ...) is a response.
	function isOwnMessage(message: ChatMessage): boolean {
		if (currentUserId != null) {
			return message.user_id === currentUserId;
		}
		// Without a known user id we can only guess, so treat the known
		// responder accounts as replies and everything else as ours.
		return !RESPONDER_USER_IDS.includes(message.user_id);
	}
</script>

<!-- Floating chat bubble -->
<div class="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
	<!-- Chat window -->
	{#if isOpen}
		{#if Panel}
			<Panel
				{threads}
				{selectedThread}
				{seenMessageIds}
				{messages}
				{sanitize}
				{loadingThreads}
				{loadingMessages}
				{error}
				{awaitingReply}
				{canSendMessages}
				{sendError}
				{sending}
				bind:draft
				{isOwnMessage}
				onclose={toggle}
				onselect={selectThread}
				onsend={send}
			/>
		{:else}
			<!--
				A tap that beat the idle warm-up. The same footprint as the window,
				so it opens in place rather than growing out of the corner.
			-->
			<div
				class="flex h-[480px] w-[360px] items-center justify-center rounded-lg border border-border bg-card shadow-xl"
				role="status"
				data-testid="chat-panel-loading"
			>
				<Loader2 class="h-5 w-5 animate-spin text-muted-foreground" aria-hidden="true" />
				<span class="sr-only">Opening the chat</span>
			</div>
		{/if}
	{/if}

	<!-- Bubble button -->
	<button
		type="button"
		onclick={toggle}
		class="relative flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 active:scale-95"
		aria-label={bubbleLabel}
	>
		{#if isOpen}
			<X class="h-6 w-6" />
		{:else}
			<MessageCircle class="h-6 w-6" />
		{/if}

		<!--
			Unread count, only worth showing while the conversation is out of
			sight. The count is already spelled out in the button's own label, so
			the badge itself is decoration.
		-->
		{#if !isOpen && unreadLabel}
			<span
				class="absolute -right-0.5 -top-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-xs font-semibold text-destructive-foreground ring-2 ring-background"
				aria-hidden="true"
			>
				{unreadLabel}
			</span>
		{/if}
	</button>
</div>
