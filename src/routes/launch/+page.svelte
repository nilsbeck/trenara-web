<script lang="ts">
	import { ChevronDown, Loader2, UserCircle } from '@lucide/svelte';
	import AppFrame from '#lib/components/shared/app-frame.svelte';
	import DashboardColumns from '#lib/components/dashboard/dashboard-columns.svelte';
</script>

<!--
	The dashboard, before it has arrived.

	A slow connection kept the screen on the splash — or, on iOS, a blank one —
	for the several seconds the dashboard took to come back, with nothing to
	say the app was doing anything. When the dashboard has not answered within
	a moment, the service worker shows this instead, from disk, and holds on to
	the request still in flight.

	It is the app's own frame and cards, drawn from the same components as the
	real page, with nothing of the runner's in them: what it promises is only
	that the plan is on its way. The heights are the real cards' — the goal
	card's head, the calendar's week (below 768px, where the calendar folds to
	a week) or month, and the day below it — measured in Chromium with the real
	dashboard rendered, so that each card arrives where its placeholder was.
-->

<svelte:head>
	<!--
		The hand-over. This starts a navigation to the dashboard as soon as the
		page has loaded; the service worker answers it with the request already
		in flight rather than asking again, and this page stays on screen until
		that answer arrives. A refresh replaces the history entry rather than
		adding one, so Back never returns here.

		A URL rather than a bare refresh, so that opening `/launch` directly
		ends on the dashboard instead of reloading itself for ever.
	-->
	<meta http-equiv="refresh" content="0; url=/dashboard" />
	<meta name="robots" content="noindex" />
</svelte:head>

<AppFrame>
	{#snippet greeting()}
		<!-- The greeting's line, held open: the name arrives with the page. -->
		&nbsp;
	{/snippet}

	{#snippet menu()}
		<!--
			The account button's footprint, not a button: there is no menu to
			open yet. The fallback face it shows when the account has no picture.
		-->
		<span class="flex items-center gap-2 px-3 py-2" aria-hidden="true">
			<UserCircle class="h-8 w-8 text-muted-foreground" />
			<ChevronDown class="h-4 w-4 text-muted-foreground" />
		</span>
	{/snippet}

	<DashboardColumns>
		{#snippet cards()}
			<div
				class="h-[13.1875rem] rounded-lg border border-border bg-card shadow-sm"
				data-testid="launch-goal-card"
			></div>
		{/snippet}

		{#snippet calendar()}
			<div class="relative mx-auto flex w-[28rem] max-w-full flex-col gap-4">
				<div
					class="flex h-[9.875rem] items-center justify-center gap-2 rounded-xl border border-border bg-card shadow-lg md:h-[23.625rem]"
					role="status"
					data-testid="launch-placeholder"
				>
					<Loader2 class="h-5 w-5 animate-spin text-muted-foreground" aria-hidden="true" />
					<span class="text-sm text-muted-foreground">Loading your plan…</span>
				</div>
				<div
					class="h-96 rounded-xl border border-border bg-card shadow-lg"
					data-testid="launch-day"
				></div>
			</div>
		{/snippet}
	</DashboardColumns>
</AppFrame>
