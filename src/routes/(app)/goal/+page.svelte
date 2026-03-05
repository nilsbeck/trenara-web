<script lang="ts">
	import type { PageServerData } from './$types';
	import GoalCard from '$lib/components/goal/goal-card.svelte';
	import PredictionsCard from '$lib/components/predictions/predictions-card.svelte';
	import { Loader2 } from 'lucide-svelte';

	let { data }: { data: PageServerData } = $props();
</script>

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
