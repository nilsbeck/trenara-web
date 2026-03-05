<script lang="ts">
	import type { PageServerData } from './$types';
	import type { Schedule } from '$lib/server/trenara/types';
	import Calendar from '$lib/components/calendar/calendar.svelte';
	import GoalCard from '$lib/components/goal/goal-card.svelte';
	import PredictionsCard from '$lib/components/predictions/predictions-card.svelte';
	import { Loader2 } from 'lucide-svelte';

	let { data }: { data: PageServerData } = $props();
</script>

<div class="flex flex-col items-center justify-center md:flex-row">
	<div class="flex flex-col items-start justify-center md:flex-row md:space-x-6">
		{#await data.schedule}
			<div class="flex items-center justify-center p-8">
				<Loader2 class="h-6 w-6 animate-spin text-muted-foreground" />
				<span class="ml-2 text-sm text-muted-foreground">Loading schedule...</span>
			</div>
		{:then schedule}
			<div class="flex flex-col items-center md:flex-row">
				<Calendar today={new Date()} {schedule} />
			</div>
		{/await}

		{#await Promise.all([data.goal, data.userStats])}
			<div class="flex items-center justify-center p-8">
				<Loader2 class="h-6 w-6 animate-spin text-muted-foreground" />
			</div>
		{:then [goal, userStats]}
			<div class="hidden space-y-6 sm:block">
				{#if goal && userStats}
					<GoalCard {goal} {userStats} />
					<PredictionsCard {userStats} />
				{:else}
					<p class="text-sm text-muted-foreground">Some data could not be loaded</p>
				{/if}
			</div>
		{:catch}
			<p class="text-sm text-destructive">Error loading goal/stats</p>
		{/await}
	</div>
</div>
