<script lang="ts">
	import type { PageServerData } from './$types';
	import GoalCard from '$lib/components/goal/goal-card.svelte';
	import PredictionsCard from '$lib/components/predictions/predictions-card.svelte';
	import { Loader2, ArrowLeft } from 'lucide-svelte';

	let { data }: { data: PageServerData } = $props();
</script>

<div class="mx-auto max-w-4xl">
	<div class="mb-6">
		<a
			href="/dashboard"
			class="inline-flex items-center gap-1.5 rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
			aria-label="Back to dashboard"
		>
			<ArrowLeft class="h-5 w-5" />
		</a>
	</div>

	<div class="flex flex-col items-center justify-center space-y-6">
	{#await Promise.all([data.goal, data.userStats])}
		<div class="flex items-center justify-center py-12">
			<Loader2 class="h-6 w-6 animate-spin text-muted-foreground" />
		</div>
	{:then [goal, userStats]}
		{#if goal && userStats}
			<GoalCard {goal} {userStats} />
			<PredictionsCard {userStats} />
		{:else}
			<p class="text-sm text-muted-foreground">No goal or stats data available.</p>
		{/if}
	{:catch}
		<p class="text-sm text-destructive">Error loading goal/stats</p>
	{/await}
	</div>
</div>
