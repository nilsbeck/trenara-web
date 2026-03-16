<script lang="ts">
	import type { PageServerData } from './$types';
	import { ArrowLeft, Archive } from 'lucide-svelte';

	let { data }: { data: PageServerData } = $props();

	function formatDate(dateStr: string): string {
		return new Date(dateStr).toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}

	function durationWeeks(start: string, end: string): number {
		const ms = new Date(end).getTime() - new Date(start).getTime();
		return Math.round(ms / (1000 * 60 * 60 * 24 * 7));
	}
</script>

<div class="mx-auto max-w-4xl">
	<div class="mb-6">
		<a
			href="/goal"
			class="inline-flex items-center gap-1.5 rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
			aria-label="Back to goal"
		>
			<ArrowLeft class="h-5 w-5" />
		</a>
	</div>

	<div class="rounded-lg border border-border bg-card shadow-sm p-6">
		<div class="flex items-center gap-3 mb-6">
			<Archive class="h-6 w-6 text-primary" />
			<h2 class="text-xl font-semibold text-card-foreground">Goal History</h2>
		</div>

		{#if data.records.length === 0}
			<p class="text-sm text-muted-foreground">
				No archived goals yet. Completed goals will appear here automatically.
			</p>
		{:else}
			<div class="overflow-x-auto">
				<table class="w-full text-sm">
					<thead>
						<tr class="border-b border-border bg-muted/50">
							<th class="px-4 py-2.5 text-left font-medium text-muted-foreground">Goal</th>
							<th class="px-4 py-2.5 text-left font-medium text-muted-foreground">Distance</th>
							<th class="px-4 py-2.5 text-left font-medium text-muted-foreground">Target Time</th>
							<th class="px-4 py-2.5 text-left font-medium text-muted-foreground">Final Prediction</th>
							<th class="px-4 py-2.5 text-left font-medium text-muted-foreground">Period</th>
							<th class="px-4 py-2.5 text-left font-medium text-muted-foreground">Duration</th>
						</tr>
					</thead>
					<tbody>
						{#each data.records as record, i}
							<tr class={i < data.records.length - 1 ? 'border-b border-border' : ''}>
								<td class="px-4 py-2.5 font-medium text-card-foreground">{record.goal_name}</td>
								<td class="px-4 py-2.5 text-card-foreground">{record.distance}</td>
								<td class="px-4 py-2.5 text-card-foreground">
									<div>{record.goal_time}</div>
									<div class="text-xs text-muted-foreground">{record.goal_pace}</div>
								</td>
								<td class="px-4 py-2.5 text-card-foreground">
									{#if record.final_predicted_time}
										<div>{record.final_predicted_time}</div>
										<div class="text-xs text-muted-foreground">{record.final_predicted_pace ?? ''}</div>
									{:else}
										<span class="text-muted-foreground">N/A</span>
									{/if}
								</td>
								<td class="px-4 py-2.5 text-card-foreground">
									<div>{formatDate(record.start_date)}</div>
									<div class="text-xs text-muted-foreground">{formatDate(record.end_date)}</div>
								</td>
								<td class="px-4 py-2.5 text-card-foreground">
									{durationWeeks(record.start_date, record.end_date)} weeks
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</div>
</div>
