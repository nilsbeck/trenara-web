<script lang="ts">
	import type { ChatThread, ChatMessage } from '$lib/server/trenara/types';
	import { MessageCircle, X, Loader2, Bot } from 'lucide-svelte';
	import DOMPurify from 'dompurify';

	let { currentUserId = null }: { currentUserId?: number | null } = $props();

	let isOpen = $state(false);
	let threads = $state<ChatThread[]>([]);
	let selectedThread = $state<ChatThread | null>(null);
	let messages = $state<ChatMessage[]>([]);
	let loadingThreads = $state(false);
	let loadingMessages = $state(false);
	let error = $state<string | null>(null);

	let messagesContainer: HTMLDivElement | undefined = $state();

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

	async function selectThread(thread: ChatThread) {
		selectedThread = thread;
		loadingMessages = true;
		error = null;
		try {
			const res = await fetch(`/api/v1/chat/threads/${thread.id}/messages`);
			if (!res.ok) throw new Error('Failed to load messages');
			const data = await res.json();
			messages = data.data ?? [];
		} catch (e) {
			error = e instanceof Error ? e.message : 'An error occurred';
		} finally {
			loadingMessages = false;
		}
	}

	function toggle() {
		isOpen = !isOpen;
		if (isOpen && threads.length === 0) {
			fetchThreads();
		}
	}

	// A message is ours only when it carries our own user id. Everything else
	// (the coach, automated replies with user_id 0, ...) is a response.
	function isOwnMessage(message: ChatMessage): boolean {
		if (currentUserId != null) {
			return message.user_id === currentUserId;
		}
		// Without a known user id, fall back to the API convention that
		// responses are authored by user_id 0.
		return message.user_id !== 0;
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

	$effect(() => {
		if (messagesContainer && messages.length > 0) {
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
				</div>

				<!-- Read-only notice -->
				<div class="border-t border-border px-4 py-2.5">
					<p class="text-center text-xs text-muted-foreground">Read-only view</p>
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
