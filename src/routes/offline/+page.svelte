<script lang="ts">
	import { CloudOff, Loader2 } from '@lucide/svelte';
	import OfflineCalendar from '#lib/components/calendar/offline-calendar.svelte';
	import { formatSavedAt, readOfflinePlan, type OfflinePlan } from '#lib/utils/offline-plan.js';
	import { isOffline } from '#lib/utils/network.js';

	/**
	 * The plan as it was last seen, shown when there is no connection.
	 *
	 * The calendar as the dashboard draws it, read-only: no rating, no moving,
	 * no setup. A change made against a copy of the plan is a change made
	 * against a plan that may no longer exist, and queueing it for later would
	 * mean deciding, on reconnect, whose version wins. So this page draws, and
	 * one line above it says that it is a copy and from when.
	 *
	 * `undefined` until the browser has looked. The page is prerendered, so its
	 * HTML is the same for everyone and knows nothing of this device's storage;
	 * that first paint says it is looking, rather than "no saved plan", which
	 * would be an answer it does not have yet.
	 */
	let plan = $state<OfflinePlan | null | undefined>(undefined);

	/** Today, as of when the page looked — the prerendered value is the build's. */
	let now = $state(new Date());

	/**
	 * What can honestly be said about the connection.
	 *
	 * `offline` when the browser says so — it only ever proves the negative.
	 * `unknown` when it does not: this page is also reached when the network is
	 * there but the server is not (a dead spot that still shows bars, Trenara
	 * down, the error page's link), and "offline" would be wrong there. `back`
	 * once the browser fires `online` while the page is open; only the event
	 * counts, since `navigator.onLine` was already true in the second case.
	 *
	 * `offline` to begin with, for the prerendered HTML: it is only ever served
	 * because something could not be reached.
	 */
	let connection = $state<'offline' | 'unknown' | 'back'>('offline');

	const status = $derived(
		connection === 'back' ? 'Back online' : connection === 'offline' ? 'Offline' : 'Not connected'
	);

	// Storage and the connection's events exist only in the browser, and this
	// page has no load to read them in (see `+page.ts`) — so they are read here,
	// once, and the two listeners are the outside-Svelte sync an effect is for.
	$effect(() => {
		plan = readOfflinePlan();
		now = new Date();
		connection = isOffline() ? 'offline' : 'unknown';

		const back = () => (connection = 'back');
		const gone = () => (connection = 'offline');
		window.addEventListener('online', back);
		window.addEventListener('offline', gone);
		return () => {
			window.removeEventListener('online', back);
			window.removeEventListener('offline', gone);
		};
	});
</script>

<svelte:head>
	<title>Offline — Trainara</title>
</svelte:head>

<!--
	One line, pinned to the top, because the one thing a runner must not lose
	track of on this page is that none of it is live.
-->
<div
	class="sticky top-0 z-20 flex items-center gap-2 border-b border-warning/30 bg-background/95 px-4 py-1.5 text-xs backdrop-blur-sm"
	role="status"
	data-testid="offline-banner"
>
	<CloudOff class="h-3.5 w-3.5 shrink-0 text-warning" aria-hidden="true" />
	<span class="min-w-0 flex-1 truncate text-muted-foreground">
		<span class="font-medium text-warning">{status}</span>
		{#if plan}
			· saved
			<time datetime={new Date(plan.savedAt).toISOString()} data-testid="offline-saved-at"
				>{formatSavedAt(plan.savedAt)}</time
			>
		{:else if plan === null}
			· no saved plan
		{/if}
	</span>
	<!--
		A full page load, not a client-side one: the dashboard needs its server
		data, and a full load is what the service worker answers — with the
		dashboard when the network is there, and with this page when it is not.
	-->
	<a
		href="/dashboard"
		data-sveltekit-reload
		class="shrink-0 font-medium {connection === 'back' ? 'text-primary' : 'text-foreground'}"
	>
		{connection === 'back' ? 'Reload' : 'Retry'}
	</a>
</div>

<div class="flex justify-center px-4 py-4">
	{#if plan === undefined}
		<!-- The calendar card's footprint, so the plan lands in place. -->
		<div
			class="flex h-80 w-[28rem] max-w-full items-center justify-center rounded-xl border border-border bg-card"
			role="status"
			data-testid="offline-plan-loading"
		>
			<Loader2 class="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
			<span class="sr-only">Looking for your saved plan</span>
		</div>
	{:else if plan}
		<OfflineCalendar {plan} today={now} />
	{:else}
		<p class="w-[28rem] max-w-full pt-8 text-center text-sm text-muted-foreground">
			Your plan needs a connection to load, and none was saved on this device yet. Nothing is lost —
			it's on Trenara, waiting.
		</p>
	{/if}
</div>
