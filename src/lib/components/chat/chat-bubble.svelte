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
	import type { ChatThread } from '#lib/server/trenara/types.js';
	import { MessageCircle, X, Loader2 } from '@lucide/svelte';
	import { onDestroy } from 'svelte';
	import { reloadOnStaleChunk, whenIdle } from '#lib/utils/load-once.js';
	import { ChatStore } from '#lib/stores/chat.svelte.js';

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

	/**
	 * The chat's view-model, owned here and handed to the window as a prop.
	 * Every request, timer and piece of state lives in it (§4 of agents.md);
	 * what is left in this file is the button, the window's chunk, and the one
	 * timer that has to follow the page's visibility.
	 */
	const chat = new ChatStore(() => currentUserId);

	/*
		The seeds arrive after mount, not with it: the layout resolves a streamed
		promise and passes what it held down as these props. So these are effects
		rather than a seat during setup, and the store takes each only once —
		`seedThreads` ignores a seed that lands after the store has fetched the
		list for itself.
	*/
	$effect(() => chat.seedThreads(initialThreads));
	$effect(() => chat.seedSeen(initialSeen));

	onDestroy(() => chat.stopReplyPolling());

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

	function toggle() {
		chat.toggle();
		if (chat.isOpen) void openPanel();
	}

	// The badge has to stay honest on a page that is left open all morning, so
	// the thread list is refreshed on a slow tick while the bubble is closed.
	const THREAD_POLL_INTERVAL_MS = 60000;

	/**
	 * Keeping the badge honest on a page left open all morning.
	 *
	 * An open chat already polls the conversation it is showing, so this tick
	 * only runs while it is closed — and only while anyone is actually looking.
	 * It used to run regardless: a phone with the PWA in the background still
	 * spent a request a minute, every open tab its own timer, against a budget
	 * of sixty a minute shared with the whole app.
	 *
	 * A hidden tab is refreshed the moment it is looked at again instead, which
	 * is the only moment a badge being a minute stale could matter. The same
	 * reasoning, and the same shape, as `#lib/utils/revalidation.js`. It stays in
	 * the view because it listens to the document, which the store does not touch.
	 */
	$effect(() => {
		if (chat.isOpen) return;

		let timer: ReturnType<typeof setInterval> | null = null;

		function stop() {
			if (timer !== null) clearInterval(timer);
			timer = null;
		}

		function start() {
			if (timer !== null) return;
			// Gated on visibility by `onVisibility` below — the same shape as
			// `revalidation`, written out because it also stops while the chat is open.
			// eslint-disable-next-line no-restricted-syntax
			timer = setInterval(() => void chat.refreshThreads(), THREAD_POLL_INTERVAL_MS);
		}

		function onVisibility() {
			if (document.visibilityState === 'visible') {
				void chat.refreshThreads();
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
</script>

<!-- Floating chat bubble -->
<div class="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
	<!-- Chat window -->
	{#if chat.isOpen}
		{#if Panel}
			<Panel {chat} />
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
		aria-label={chat.bubbleLabel}
	>
		{#if chat.isOpen}
			<X class="h-6 w-6" />
		{:else}
			<MessageCircle class="h-6 w-6" />
		{/if}

		<!--
			Unread count, only worth showing while the conversation is out of
			sight. The count is already spelled out in the button's own label, so
			the badge itself is decoration.
		-->
		{#if !chat.isOpen && chat.unreadLabel}
			<span
				class="absolute -right-0.5 -top-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-xs font-semibold text-destructive-foreground ring-2 ring-background"
				aria-hidden="true"
			>
				{chat.unreadLabel}
			</span>
		{/if}
	</button>
</div>
