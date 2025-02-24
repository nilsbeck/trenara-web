<script lang="ts">
	import type { PageServerData } from './$types';
	let { data }: { data: PageServerData } = $props();
	import Loading from '$lib/components/loading.svelte';
	import Calendar from '$lib/components/calendar.svelte';
	import GoalCard from '$lib/components/goal.svelte';
</script>

<div class="flex flex-col md:flex-row items-start justify-center space-x-6">
	{#await data.schedule}
		<div class="flex flex-row items-center">
			<Loading />
		</div>
	{:then schedule}
		<div class="flex flex-col md:flex-row items-center">
			<Calendar today={new Date()} {schedule} />
		</div>
	{/await}
	{#await Promise.all([data.goal, data.userStats])}
		<div class="flex flex-row items-center">
			<Loading />
		</div>
	{:then [goal, userStats]}
		<div class="hidden md:block">
			<GoalCard {goal} {userStats} />
		</div>
	{:catch error}
		<p>Error loading goal/stats</p>
	{/await}
</div>
