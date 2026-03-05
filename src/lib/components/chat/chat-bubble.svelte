<script lang="ts">
	import type { ChatThread, ChatMessage } from '$lib/server/trenara/types';
	import { MessageCircle, X, Loader2 } from 'lucide-svelte';

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
						{#each messages as message}
							{@const isUser = message.user_id !== 0}
							<div class="flex {isUser ? 'justify-end' : 'justify-start'}">
								<div
									class="max-w-[80%] rounded-lg px-3 py-2 text-sm {isUser
										? 'bg-primary text-primary-foreground'
										: 'bg-muted text-card-foreground'}"
								>
									{#if message.body_html}
										{@html message.body_html}
									{:else}
										{message.body}
									{/if}
									<p
										class="mt-1 text-[10px] {isUser
											? 'text-primary-foreground/60'
											: 'text-muted-foreground'}"
									>
										{formatTimestamp(message.created_at)}
									</p>
								</div>
							</div>
						{/each}
					{/if}
				</div>

				<!-- Read-only notice -->
				<div class="border-t border-border px-4 py-2.5">
					<p class="text-center text-xs text-muted-foreground">
						Read-only view
					</p>
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
