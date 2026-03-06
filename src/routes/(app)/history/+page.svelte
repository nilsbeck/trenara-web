<script lang="ts">
	import type { PageServerData } from './$types';
	import PredictionChart, {
		type ChartDataPoint
	} from '$lib/components/charts/prediction-chart.svelte';
	import { timeStringToSeconds, paceStringToSeconds } from '$lib/utils/format';
	import { History, ArrowLeft } from 'lucide-svelte';

	let { data }: { data: PageServerData } = $props();

	interface PredictionRecord {
		id: number;
		user_id: number;
		predicted_time: string;
		predicted_pace: string;
		recorded_at: string;
		created_at: string;
	}

	const chartData = $derived<ChartDataPoint[]>(
		(data.records as PredictionRecord[])
			.map((r) => {
				try {
					return {
						date: r.recorded_at,
						predictedTime: timeStringToSeconds(r.predicted_time),
						predictedPace: paceStringToSeconds(r.predicted_pace),
						formattedTime: r.predicted_time,
						formattedPace: r.predicted_pace
					};
				} catch {
					return null;
				}
			})
			.filter((d): d is ChartDataPoint => d !== null)
	);

	const records = $derived(data.records as PredictionRecord[]);
</script>

<div class="mx-auto max-w-4xl">
	<!-- Header -->
	<div class="mb-6 flex items-center gap-3">
		<a
			href="/dashboard"
			class="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
			aria-label="Back to dashboard"
		>
			<ArrowLeft class="h-5 w-5" />
		</a>
		<History class="h-6 w-6 text-primary" />
		<h1 class="text-2xl font-semibold text-foreground">Prediction History</h1>
		<span class="ml-auto text-sm text-muted-foreground">
			{records.length} record{records.length !== 1 ? 's' : ''}
		</span>
	</div>

	<!-- Chart -->
	<div class="rounded-lg border border-border bg-card p-6 shadow-sm mb-6">
		<h2 class="text-sm font-medium text-muted-foreground mb-4">All-Time Prediction Progress</h2>
		<PredictionChart data={chartData} />
	</div>

	<!-- Data table -->
	{#if records.length > 0}
		<div class="rounded-lg border border-border bg-card shadow-sm overflow-hidden">
			<table class="w-full text-sm">
				<thead>
					<tr class="border-b border-border bg-muted/50">
						<th class="px-4 py-3 text-left font-medium text-muted-foreground">Date</th>
						<th class="px-4 py-3 text-left font-medium text-muted-foreground">Predicted Time</th>
						<th class="px-4 py-3 text-left font-medium text-muted-foreground">Predicted Pace</th>
					</tr>
				</thead>
				<tbody>
					{#each [...records].reverse() as record, i}
						<tr class={i % 2 === 0 ? 'bg-card' : 'bg-muted/20'}>
							<td class="px-4 py-2.5 text-card-foreground">
								{new Date(record.recorded_at).toLocaleDateString('en-US', {
									year: 'numeric',
									month: 'short',
									day: 'numeric'
								})}
							</td>
							<td class="px-4 py-2.5 text-card-foreground font-mono">
								{record.predicted_time}
							</td>
							<td class="px-4 py-2.5 text-card-foreground font-mono">
								{record.predicted_pace} min/km
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{:else}
		<div class="rounded-lg border border-border bg-card p-8 text-center shadow-sm">
			<p class="text-muted-foreground">No prediction history available yet.</p>
			<p class="mt-1 text-sm text-muted-foreground">
				Predictions are recorded automatically when you visit your dashboard.
			</p>
		</div>
	{/if}
</div>
