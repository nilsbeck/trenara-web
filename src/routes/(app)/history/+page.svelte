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
	<div class="rounded-lg border border-border bg-card p-6 shadow-sm">
		<h2 class="text-sm font-medium text-muted-foreground mb-4">All-Time Prediction Progress</h2>
		<PredictionChart data={chartData} />
	</div>

	{#if records.length === 0}
		<div class="rounded-lg border border-border bg-card p-8 text-center shadow-sm mt-6">
			<p class="text-muted-foreground">No prediction history available yet.</p>
			<p class="mt-1 text-sm text-muted-foreground">
				Predictions are recorded automatically when you visit your dashboard.
			</p>
		</div>
	{/if}
</div>
