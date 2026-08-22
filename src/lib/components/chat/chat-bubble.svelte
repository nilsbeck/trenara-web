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
		withMessage
	} from './message-list';

	let { currentUserId = null }: { currentUserId?: number | null } = $props();

	let isOpen = $state(false);
	let threads = $state<ChatThread[]>([]);
	let selectedThread = $state<ChatThread | null>(null);
	let messages = $state<ChatMessage[]>([]);
	let loadingThreads = $state(false);
	let loadingMessages = $state(false);
	let error = $state<string | null>(null);

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

	// Only hide the composer when the thread explicitly forbids posting. No
	// captured payload pins `can_send_messages` down, so a missing field must
	// not silently turn the chat read-only again.
	const canSendMessages = $derived(
		selectedThread != null &&
			selectedThread.can_send_messages !== false &&
			selectedThread.disabled !== true
	);

	async function fetchThreads() {
		loadingThreads = true;
		error = null;
		try {
			const res = await fetch('/api/v1/chat/threads/');
			if (!res.ok) throw new Error('Failed to load threads');
			threads = await res.json();
			if (threads.length > 0 && !selectedThread) {
				await selectThread(threads[0]);
			}
		} catch (e) {
			error = e instanceof Error ? e.message : 'An error occurred';
		} finally {
			loadingThreads = false;
		}
	}

	async function fetchMessages(threadId: number): Promise<ChatMessage[]> {
		const res = await fetch(`/api/v1/chat/threads/${threadId}/messages`);
		if (!res.ok) throw new Error('Failed to load messages');
		const data = await res.json();
		return data.data ?? [];
	}

	async function selectThread(thread: ChatThread) {
		stopReplyPolling();
		selectedThread = thread;
		loadingMessages = true;
		error = null;
		sendError = null;
		try {
			messages = await fetchMessages(thread.id);
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

	function toggle() {
		isOpen = !isOpen;
		if (isOpen && threads.length === 0) {
			fetchThreads();
		}
		if (!isOpen) {
			stopReplyPolling();
		}
	}

	onDestroy(stopReplyPolling);

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
							{#if thread.unread_messages > 0}
								<span
									class="mt-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-medium text-primary-foreground"
								>
									{thread.unread_messages}
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
		class="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 active:scale-95"
		aria-label={isOpen ? 'Close chat' : 'Open chat'}
	>
		{#if isOpen}
			<X class="h-6 w-6" />
		{:else}
			<MessageCircle class="h-6 w-6" />
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
