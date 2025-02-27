<script lang="ts">
	import type { PageServerData } from './$types';
	let { data }: { data: PageServerData } = $props();
	import Loading from '$lib/components/loading.svelte';
	import GoalCard from '$lib/components/goal.svelte';
	import Predictions from '$lib/components/predictions.svelte';
	
</script>

<div class="flex flex-col items-center justify-center space-y-6">
	{#await Promise.all([data.goal, data.userStats])}
		<div class="flex flex-row items-center">
			<Loading />
		</div>
	{:then [goal, userStats]}
			<GoalCard {goal} {userStats}/>
			<Predictions {userStats}/>
	{:catch error}
		<p>Error loading goal/stats</p>
	{/await}
</div>
