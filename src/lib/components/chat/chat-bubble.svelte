<script lang="ts">
	import type { ChatThread, ChatMessage } from '$lib/server/trenara/types';
	import { MessageCircle, X, Loader2, Bot, Send } from 'lucide-svelte';
	import { onDestroy } from 'svelte';
	import DOMPurify from 'dompurify';
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
	import {
		formatUnreadBadge,
		threadUnread,
		totalUnread,
		withSeen,
		type SeenMessageIds
	} from './unread';

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

	let messagesContainer: HTMLDivElement | undefined = $state();
	let draftInput: HTMLTextAreaElement | undefined = $state();

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
		if (!res.ok) throw new Error('Failed to load threads');
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
			error = e instanceof Error ? e.message : 'An error occurred';
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
		const res = await fetch(`/api/v1/chat/threads/${threadId}/messages`);
		if (!res.ok) throw new Error('Failed to load messages');
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
			error = e instanceof Error ? e.message : 'An error occurred';
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
			if (!res.ok) throw new Error('Failed to send message');

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
			sendError = e instanceof Error ? e.message : 'Failed to send message';
		} finally {
			sending = false;
			draftInput?.focus();
		}
	}

	function startReplyPolling(threadId: number) {
		stopReplyPolling();

		const knownIds = serverIds(messages);
		const deadline = Date.now() + REPLY_POLL_TIMEOUT_MS;
		awaitingReply = true;

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

	function onDraftKeydown(event: KeyboardEvent) {
		// Enter sends, Shift+Enter starts a new line.
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			send();
		}
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

	// An open bubble already polls the conversation it is showing, so the thread
	// tick only runs while it is closed.
	$effect(() => {
		if (isOpen) return;
		const timer = setInterval(() => {
			refreshThreads();
		}, THREAD_POLL_INTERVAL_MS);
		return () => clearInterval(timer);
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

	function responderName(): string {
		return selectedThread?.title ?? 'Coach';
	}

	function formatTimestamp(ts: number): string {
		return new Date(ts * 1000).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	// Keeps the newest message — or the typing indicator — in view.
	$effect(() => {
		if (messagesContainer && (messages.length > 0 || awaitingReply)) {
			messagesContainer.scrollTop = messagesContainer.scrollHeight;
		}
	});
</script>

<!-- Floating chat bubble -->
<div class="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
	<!-- Chat window -->
	{#if isOpen}
		<div
			class="flex h-[480px] w-[360px] flex-col overflow-hidden rounded-lg border border-border bg-card shadow-xl"
		>
			<!-- Header -->
			<div class="flex items-center justify-between border-b border-border bg-primary px-4 py-3">
				<h3 class="text-sm font-semibold text-primary-foreground">
					{selectedThread ? selectedThread.title : 'Chat'}
				</h3>
				<button
					type="button"
					onclick={toggle}
					class="rounded-md p-1 text-primary-foreground/80 hover:text-primary-foreground"
				>
					<X class="h-4 w-4" />
				</button>
			</div>

			<!-- Thread list (shown when no thread selected or multiple threads) -->
			{#if !selectedThread && !loadingThreads}
				<div class="flex-1 overflow-y-auto">
					{#each threads as thread}
						{@const threadUnreadLabel = formatUnreadBadge(threadUnread(thread, seenMessageIds))}
						<button
							type="button"
							onclick={() => selectThread(thread)}
							class="flex w-full items-start gap-3 border-b border-border px-4 py-3 text-left hover:bg-muted/50"
						>
							<div class="flex-1 min-w-0">
								<p class="text-sm font-medium text-card-foreground truncate">{thread.title}</p>
								<p class="text-xs text-muted-foreground truncate">{thread.sub_title}</p>
								{#if thread.last_message}
									<p class="mt-1 text-xs text-muted-foreground truncate">
										{thread.last_message.body}
									</p>
								{/if}
							</div>
							{#if threadUnreadLabel}
								<span
									class="mt-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-medium text-primary-foreground"
								>
									{threadUnreadLabel}
								</span>
							{/if}
						</button>
					{/each}
				</div>
			{/if}

			<!-- Messages -->
			{#if selectedThread}
				<div bind:this={messagesContainer} class="flex-1 overflow-y-auto p-4 space-y-3">
					{#if loadingMessages}
						<div class="flex items-center justify-center h-full">
							<Loader2 class="h-5 w-5 animate-spin text-muted-foreground" />
						</div>
					{:else if error}
						<p class="text-center text-sm text-destructive">{error}</p>
					{:else if messages.length === 0}
						<p class="text-center text-sm text-muted-foreground">No messages yet.</p>
					{:else}
						{#each messages as message, i}
							{@const isOwn = isOwnMessage(message)}
							{@const startsGroup = i === 0 || isOwnMessage(messages[i - 1]) !== isOwn}
							{#if isOwn}
								<!-- Own message -->
								<div class="flex justify-end">
									<div class="flex max-w-[80%] flex-col items-end">
										<div
											class="rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm text-primary-foreground"
										>
											<div class="chat-content">
												{#if message.body_html}
													{@html DOMPurify.sanitize(message.body_html)}
												{:else}
													{message.body}
												{/if}
											</div>
										</div>
										<p class="mt-1 px-1 text-[10px] text-muted-foreground">
											{formatTimestamp(message.created_at)}
										</p>
									</div>
								</div>
							{:else}
								<!-- Chat response -->
								<div class="flex justify-start gap-2">
									<div class="w-7 shrink-0">
										{#if startsGroup}
											{#if message.picture_url}
												<img
													src={message.picture_url}
													alt=""
													class="h-7 w-7 rounded-full object-cover"
												/>
											{:else}
												<div
													class="flex h-7 w-7 items-center justify-center rounded-full bg-secondary text-secondary-foreground"
												>
													<Bot class="h-4 w-4" />
												</div>
											{/if}
										{/if}
									</div>
									<div class="flex max-w-[80%] flex-col items-start">
										{#if startsGroup}
											<p class="mb-1 px-1 text-[11px] font-medium text-muted-foreground">
												{responderName()}
											</p>
										{/if}
										<div
											class="rounded-2xl rounded-tl-sm border border-border bg-muted px-3 py-2 text-sm text-card-foreground"
										>
											<div class="chat-content">
												{#if message.body_html}
													{@html DOMPurify.sanitize(message.body_html)}
												{:else}
													{message.body}
												{/if}
											</div>
										</div>
										<p class="mt-1 px-1 text-[10px] text-muted-foreground">
											{formatTimestamp(message.created_at)}
										</p>
									</div>
								</div>
							{/if}
						{/each}
					{/if}

					{#if awaitingReply}
						<!-- Waiting on the coach's reply -->
						<div class="flex justify-start gap-2">
							<div class="w-7 shrink-0"></div>
							<div
								class="flex items-center gap-1 rounded-2xl rounded-tl-sm border border-border bg-muted px-3 py-2.5"
								aria-label="{responderName()} is typing"
							>
								<span class="typing-dot"></span>
								<span class="typing-dot"></span>
								<span class="typing-dot"></span>
							</div>
						</div>
					{/if}
				</div>

				<!-- Composer -->
				<div class="border-t border-border px-3 py-2.5">
					{#if canSendMessages}
						{#if sendError}
							<p class="mb-1.5 px-1 text-xs text-destructive">{sendError}</p>
						{/if}
						<form
							class="flex items-end gap-2"
							onsubmit={(event) => {
								event.preventDefault();
								send();
							}}
						>
							<label class="sr-only" for="chat-draft">Ask a question</label>
							<textarea
								id="chat-draft"
								bind:this={draftInput}
								bind:value={draft}
								onkeydown={onDraftKeydown}
								rows="1"
								placeholder="Ask a question..."
								disabled={sending}
								class="max-h-24 min-h-9 flex-1 resize-none rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-60"
							></textarea>
							<button
								type="submit"
								disabled={sending || !draft.trim()}
								aria-label="Send message"
								class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
							>
								{#if sending}
									<Loader2 class="h-4 w-4 animate-spin" />
								{:else}
									<Send class="h-4 w-4" />
								{/if}
							</button>
						</form>
					{:else}
						<p class="text-center text-xs text-muted-foreground">This conversation is read-only.</p>
					{/if}
				</div>
			{/if}

			<!-- Loading threads -->
			{#if loadingThreads}
				<div class="flex flex-1 items-center justify-center">
					<Loader2 class="h-5 w-5 animate-spin text-muted-foreground" />
				</div>
			{/if}
		</div>
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

<style>
	.typing-dot {
		height: 0.375rem;
		width: 0.375rem;
		border-radius: 9999px;
		background-color: currentColor;
		opacity: 0.4;
		animation: typing 1.2s infinite ease-in-out;
	}
	.typing-dot:nth-child(2) {
		animation-delay: 0.2s;
	}
	.typing-dot:nth-child(3) {
		animation-delay: 0.4s;
	}
	@keyframes typing {
		0%,
		60%,
		100% {
			opacity: 0.25;
			transform: translateY(0);
		}
		30% {
			opacity: 0.8;
			transform: translateY(-2px);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.typing-dot {
			animation: none;
		}
	}

	/* Rendered message HTML (lists, links, paragraphs) coming from the API. */
	.chat-content :global(p) {
		margin: 0;
	}
	.chat-content :global(p + p) {
		margin-top: 0.5rem;
	}
	.chat-content :global(ul),
	.chat-content :global(ol) {
		margin: 0.5rem 0;
		padding-left: 1.15rem;
		list-style-position: outside;
	}
	.chat-content :global(ul) {
		list-style-type: disc;
	}
	.chat-content :global(ol) {
		list-style-type: decimal;
	}
	.chat-content :global(li + li) {
		margin-top: 0.15rem;
	}
	.chat-content :global(a) {
		text-decoration: underline;
	}
	.chat-content :global(strong) {
		font-weight: 600;
	}
	.chat-content :global(img) {
		max-width: 100%;
		border-radius: 0.5rem;
	}
	.chat-content :global(br:last-child) {
		display: none;
	}
</style>
