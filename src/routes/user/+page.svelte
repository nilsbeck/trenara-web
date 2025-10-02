<script lang="ts">
	import type { PageServerData } from './$types';
	import type { Schedule } from '$lib/server/api';
	let { data }: { data: PageServerData } = $props();
	import Loading from '$lib/components/loading.svelte';
	import GoalCard from '$lib/components/goal.svelte';
	import Predictions from '$lib/components/predictions.svelte';
	import Calendar from '$lib/components/calendar/calendar.svelte';
	// Function to merge schedules
	function mergeSchedules(schedules: Schedule[]): Schedule {
		const mergedSchedule: Schedule = {
			id: 0,
			start_day: 0,
			start_day_long: '',
			training_week: 0,
			type: 'ultimate',
			trainings: [],
			strength_trainings: [],
			entries: []
		};

		schedules.forEach((schedule) => {
			mergedSchedule.trainings = mergedSchedule.trainings.concat(schedule.trainings);
			mergedSchedule.strength_trainings = mergedSchedule.strength_trainings.concat(
				schedule.strength_trainings
			);
			mergedSchedule.entries = mergedSchedule.entries.concat(schedule.entries);
		});

		return mergedSchedule;
	}
</script>

<div class="flex flex-col md:flex-row items-center justify-center">
	<div class="flex flex-col md:flex-row items-start justify-center md:space-x-6">
		{#await data.schedule}
			<div class="flex flex-row items-center">
				<Loading />
			</div>
		{:then schedule}
			<div class="flex flex-col md:flex-row items-center">
				<Calendar today={new Date()} schedule={mergeSchedules(schedule)} />
			</div>
		{/await}
		{#await Promise.all([data.goal, data.userStats])}
			<div class="flex flex-row items-center">
				<Loading />
			</div>
		{:then [goal, userStats]}
			<div class="hidden sm:block md:space-y-6">
				{#if goal && userStats}
					<GoalCard {goal} {userStats} />
					<Predictions {userStats} />
				{:else}
					<p>Some data could not be loaded</p>
				{/if}
			</div>
		{:catch error}
			{#if error.status === 401}
				<script>
					window.location.href = '/login';
				</script>
			{/if}
			<p>Error loading goal/stats</p>
		{/await}
	</div>
</div>
