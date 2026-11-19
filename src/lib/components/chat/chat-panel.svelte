<script lang="ts">
	import type { ChatStore } from '#lib/stores/chat.svelte.js';
	import { X, Loader2, Bot, Send } from '@lucide/svelte';
	import { formatUnreadBadge, threadUnread } from './unread';

	/**
	 * The open chat window: thread list, conversation and composer.
	 *
	 * Split out of `chat-bubble.svelte` so that it can be left out of the
	 * signed-in shell. The bubble is on every page and its badge has to be right
	 * in the first paint, but this window exists only once the bubble has been
	 * tapped — so its markup and styles were downloaded, parsed and compiled on
	 * every launch for a conversation most launches never open. The bubble now
	 * warms this file once the page is idle and mounts it on the first tap.
	 *
	 * A view and nothing more. It is handed the chat's view-model, which the
	 * bubble owns (`#lib/stores/chat.svelte.ts`), reads it and calls its
	 * methods. The two element references and the effect that keeps the newest
	 * message in view are the only things this file owns, because they are
	 * about its own DOM.
	 */
	let { chat }: { chat: ChatStore } = $props();

	let messagesContainer: HTMLDivElement | undefined = $state();
	let draftInput: HTMLTextAreaElement | undefined = $state();

	async function submit() {
		await chat.send();
		draftInput?.focus();
	}

	function onDraftKeydown(event: KeyboardEvent) {
		// Enter sends, Shift+Enter starts a new line.
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			submit();
		}
	}

	function responderName(): string {
		return chat.selectedThread?.title ?? 'Coach';
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
		if (messagesContainer && (chat.messages.length > 0 || chat.awaitingReply)) {
			messagesContainer.scrollTop = messagesContainer.scrollHeight;
		}
	});
</script>

<div
	class="flex h-[480px] w-[360px] flex-col overflow-hidden rounded-lg border border-border bg-card shadow-xl"
>
	<!-- Header -->
	<div class="flex items-center justify-between border-b border-border bg-primary px-4 py-3">
		<h3 class="text-sm font-semibold text-primary-foreground">
			{chat.selectedThread ? chat.selectedThread.title : 'Chat'}
		</h3>
		<button
			type="button"
			onclick={() => chat.close()}
			class="rounded-md p-1 text-primary-foreground/80 hover:text-primary-foreground"
		>
			<X class="h-4 w-4" />
		</button>
	</div>

	<!-- Thread list (shown when no thread selected or multiple threads) -->
	{#if !chat.selectedThread && !chat.loadingThreads}
		<div class="flex-1 overflow-y-auto">
			{#each chat.threads as thread (thread.id)}
				{@const threadUnreadLabel = formatUnreadBadge(threadUnread(thread, chat.seenMessageIds))}
				<button
					type="button"
					onclick={() => chat.selectThread(thread)}
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
	{#if chat.selectedThread}
		<div bind:this={messagesContainer} class="flex-1 overflow-y-auto p-4 space-y-3">
			{#if chat.loadingMessages}
				<div class="flex items-center justify-center h-full">
					<Loader2 class="h-5 w-5 animate-spin text-muted-foreground" />
				</div>
			{:else if chat.error}
				<p class="text-center text-sm text-destructive">{chat.error}</p>
			{:else if chat.messages.length === 0}
				<p class="text-center text-sm text-muted-foreground">No messages yet.</p>
			{:else}
				{#each chat.messages as message, i (message.id)}
					{@const isOwn = chat.isOwnMessage(message)}
					{@const startsGroup = i === 0 || chat.isOwnMessage(chat.messages[i - 1]) !== isOwn}
					{#if isOwn}
						<!-- Own message -->
						<div class="flex justify-end">
							<div class="flex max-w-[80%] flex-col items-end">
								<div
									class="rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm text-primary-foreground"
								>
									<div class="chat-content">
										{#if message.body_html && chat.sanitize}
											<!-- Sanitised: `chat.sanitize` is DOMPurify and is null until it
													 has loaded, so this branch is not taken before then. -->
											<!-- eslint-disable-next-line svelte/no-at-html-tags -->
											{@html chat.sanitize(message.body_html)}
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
										{#if message.body_html && chat.sanitize}
											<!-- Sanitised: `chat.sanitize` is DOMPurify and is null until it
													 has loaded, so this branch is not taken before then. -->
											<!-- eslint-disable-next-line svelte/no-at-html-tags -->
											{@html chat.sanitize(message.body_html)}
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

			{#if chat.awaitingReply}
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
			{#if chat.canSendMessages}
				{#if chat.sendError}
					<p class="mb-1.5 px-1 text-xs text-destructive">{chat.sendError}</p>
				{/if}
				<form
					class="flex items-end gap-2"
					onsubmit={(event) => {
						event.preventDefault();
						submit();
					}}
				>
					<label class="sr-only" for="chat-draft">Ask a question</label>
					<textarea
						id="chat-draft"
						bind:this={draftInput}
						bind:value={chat.draft}
						onkeydown={onDraftKeydown}
						rows="1"
						placeholder="Ask a question..."
						disabled={chat.sending}
						class="max-h-24 min-h-9 flex-1 resize-none rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-60"
					></textarea>
					<button
						type="submit"
						disabled={chat.sending || !chat.draft.trim()}
						aria-label="Send message"
						class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
					>
						{#if chat.sending}
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
	{#if chat.loadingThreads}
		<div class="flex flex-1 items-center justify-center">
			<Loader2 class="h-5 w-5 animate-spin text-muted-foreground" />
		</div>
	{/if}
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
