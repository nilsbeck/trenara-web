<script lang="ts">
	import type { PageServerData } from './$types';
	import Calendar from '$lib/components/calendar/calendar.svelte';
	import GoalCard from '$lib/components/goal/goal-card.svelte';
	import PredictionsCard from '$lib/components/predictions/predictions-card.svelte';

	let { data }: { data: PageServerData } = $props();
</script>

<div class="flex flex-col items-center justify-center md:flex-row">
	<div class="flex flex-col items-start justify-center md:flex-row md:space-x-6">
		<div class="flex flex-col items-center md:flex-row">
			<Calendar today={new Date()} schedule={data.schedule} />
		</div>

		<div class="hidden space-y-6 sm:block">
			{#if data.goal && data.userStats}
				<GoalCard goal={data.goal} userStats={data.userStats} />
				<PredictionsCard userStats={data.userStats} />
			{:else}
				<p class="text-sm text-muted-foreground">Some data could not be loaded</p>
			{/if}
		</div>
	</div>
</div>
