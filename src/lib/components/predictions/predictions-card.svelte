<script lang="ts">
	import type { UserStats } from '$lib/server/trenara/types';
	import { Timer } from 'lucide-svelte';

	let { userStats }: { userStats: UserStats } = $props();

	const races = $derived([
		{
			name: '5 km',
			time: userStats.best_times.time_for_5,
			pace: userStats.best_times.pace_for_5
		},
		{
			name: '10 km',
			time: userStats.best_times.time_for_10,
			pace: userStats.best_times.pace_for_10
		},
		{
			name: '21.1 km',
			time: userStats.best_times.time_for_half_marathon,
			pace: userStats.best_times.pace_for_half_marathon
		},
		{
			name: '42.2 km',
			time: userStats.best_times.time_for_marathon,
			pace: userStats.best_times.pace_for_marathon
		}
	]);
</script>

<div class="rounded-lg border border-border bg-card shadow-sm p-6">
	<div class="flex items-center gap-3 mb-4">
		<Timer class="h-6 w-6 text-primary" />
		<h2 class="text-xl font-semibold text-card-foreground">Race Predictions</h2>
	</div>

	<p class="text-sm text-muted-foreground mb-4">
		Predicted race times based on your current fitness level.
	</p>

	<div class="overflow-hidden rounded-md border border-border">
		<table class="w-full text-sm">
			<thead>
				<tr class="border-b border-border bg-muted/50">
					<th class="px-4 py-2.5 text-left font-medium text-muted-foreground">Distance</th>
					<th class="px-4 py-2.5 text-left font-medium text-muted-foreground">Time</th>
					<th class="px-4 py-2.5 text-left font-medium text-muted-foreground">
						Pace ({userStats.best_times.pace_unit})
					</th>
				</tr>
			</thead>
			<tbody>
				{#each races as race, i}
					<tr class={i < races.length - 1 ? 'border-b border-border' : ''}>
						<td class="px-4 py-2.5 font-medium text-card-foreground">{race.name}</td>
						<td class="px-4 py-2.5 text-card-foreground">{race.time}</td>
						<td class="px-4 py-2.5 text-card-foreground">{race.pace}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>
