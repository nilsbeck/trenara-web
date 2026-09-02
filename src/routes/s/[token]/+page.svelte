<script lang="ts">
	import type { PageServerData } from './$types';
	import GoalCard from '$lib/components/goal/goal-card.svelte';
	import { relativeTimeAgo } from '$lib/utils/relative-time';
	import { toDate } from '$lib/utils/date';
	import { Target } from 'lucide-svelte';

	let { data }: { data: PageServerData } = $props();

	const snapshotAt = $derived(data.snapshotAt ? toDate(data.snapshotAt) : null);
	const updatedText = $derived(snapshotAt ? `Updated ${relativeTimeAgo(snapshotAt)}` : null);

	const heading = $derived(data.title || data.goal?.name || 'A shared goal');
</script>

<!--
	No name, no target, no times: a link forwarded into a group chat should
	not render this runner's numbers in the preview before anyone has decided
	to open it. `og:image` points at the app's own icon rather than nothing,
	so the card still renders something in clients that refuse to show a
	preview with no image at all.
-->
<svelte:head>
	<title>Trainara — a shared running goal</title>
	<meta name="robots" content="noindex, nofollow" />
	<meta property="og:title" content="Trainara — a shared running goal" />
	<meta property="og:description" content="Someone shared their training goal with you." />
	<meta property="og:image" content="/icons/icon-512x512.png" />
</svelte:head>

<div class="mx-auto flex min-h-screen max-w-2xl flex-col px-4 py-10">
	<header class="mb-6">
		<h1 class="text-lg font-semibold text-foreground">{heading}</h1>
		<p class="mt-1 text-sm text-muted-foreground">
			{#if data.name}
				Shared by {data.name}
			{:else}
				A goal shared from Trainara
			{/if}
			{#if updatedText}
				· {updatedText}
			{/if}
		</p>
	</header>

	<main class="flex-1">
		{#if data.goal && data.userStats}
			<GoalCard
				goal={data.goal}
				userStats={data.userStats}
				history={data.history.records}
				historyError={data.history.error}
				views={['prediction']}
			/>
		{:else}
			<!--
				Not an error: a link created moments ago, one whose owner has not
				opened Trainara since, or a snapshot written by a shape of the app
				this deploy no longer reads. All three are the same honest answer —
				there is nothing to show yet — so all three read as one state.
			-->
			<div class="rounded-lg border border-border bg-card p-8 text-center shadow-sm">
				<Target class="mx-auto mb-3 h-8 w-8 text-muted-foreground" aria-hidden="true" />
				<h2 class="text-lg font-semibold text-card-foreground">Not updated yet</h2>
				<p class="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
					This goal hasn't been updated yet — check back once {data.name || 'they'} next open{data.name
						? 's'
						: ''} Trainara.
				</p>
			</div>
		{/if}
	</main>

	<footer class="mt-10 border-t border-border pt-6 text-center text-xs text-muted-foreground">
		<p>
			<a href="/" class="underline hover:text-foreground">Trainara</a>
			is an unofficial, unaffiliated third-party client for Trenara. This page is a read-only view a runner
			chose to share and is not affiliated with or supported by Trenara.
		</p>
	</footer>
</div>
