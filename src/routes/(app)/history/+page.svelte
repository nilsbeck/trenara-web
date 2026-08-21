<script lang="ts">
	import type { PageServerData } from './$types';
	import PredictionChart, {
		type ChartDataPoint
	} from '$lib/components/charts/prediction-chart.svelte';
	import { timeStringToSeconds, paceStringToSeconds } from '$lib/utils/format';
	import { History, ArrowLeft, Loader2 } from 'lucide-svelte';
	import { onMount } from 'svelte';

	let { data }: { data: PageServerData } = $props();

	interface PredictionRecord {
		id: number;
		user_id: number;
		predicted_time: string;
		predicted_pace: string;
		predicted_time_10k: string | null;
		predicted_pace_10k: string | null;
		recorded_at: string;
		created_at: string;
	}

	const records = $derived(data.records as PredictionRecord[]);

	// This chart spans every goal the user has ever trained for, so it plots the
	// 10K prediction rather than the goal-distance one: the goal distance changes
	// between training blocks and would make the series incomparable. Rows
	// recorded before 10K tracking existed have no value here and are skipped.
	type TrackedRecord = PredictionRecord & {
		predicted_time_10k: string;
		predicted_pace_10k: string;
	};

	const trackedRecords = $derived(
		records.filter(
			(r): r is TrackedRecord => r.predicted_time_10k !== null && r.predicted_pace_10k !== null
		)
	);
	const untrackedCount = $derived(records.length - trackedRecords.length);

	// Defer chart rendering to after mount so the page shell paints instantly
	let chartReady = $state(false);
	let chartData = $state<ChartDataPoint[]>([]);

	onMount(() => {
		chartData = trackedRecords
			.map((r) => {
				try {
					return {
						date: r.recorded_at,
						predictedTime: timeStringToSeconds(r.predicted_time_10k),
						predictedPace: paceStringToSeconds(r.predicted_pace_10k),
						formattedTime: r.predicted_time_10k,
						formattedPace: r.predicted_pace_10k
					};
				} catch {
					return null;
				}
			})
			.filter((d): d is ChartDataPoint => d !== null);
		chartReady = true;
	});
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
			{trackedRecords.length} record{trackedRecords.length !== 1 ? 's' : ''}
		</span>
	</div>

	<!-- Chart -->
	<div class="rounded-lg border border-border bg-card p-6 shadow-sm">
		<h2 class="text-sm font-medium text-muted-foreground">All-Time 10K Prediction Progress</h2>
		<p class="mb-4 mt-1 text-xs text-muted-foreground">
			Measured against a fixed 10K distance so progress stays comparable across goals.
		</p>
		{#if chartReady}
			<PredictionChart
				data={chartData}
				timeLabel="Predicted 10K Time"
				paceLabel="Predicted 10K Pace"
			/>
		{:else}
			<div class="flex items-center justify-center py-16">
				<Loader2 class="h-5 w-5 animate-spin text-muted-foreground" />
				<span class="ml-2 text-sm text-muted-foreground">Loading chart...</span>
			</div>
		{/if}
	</div>

	{#if records.length === 0}
		<div class="rounded-lg border border-border bg-card p-8 text-center shadow-sm mt-6">
			<p class="text-muted-foreground">No prediction history available yet.</p>
			<p class="mt-1 text-sm text-muted-foreground">
				Predictions are recorded automatically when you visit your dashboard.
			</p>
		</div>
	{:else if untrackedCount > 0}
		<div class="rounded-lg border border-border bg-card p-4 text-center shadow-sm mt-6">
			<p class="text-sm text-muted-foreground">
				{untrackedCount} earlier record{untrackedCount !== 1 ? 's are' : ' is'} not shown: they were recorded
				against the goal distance of the time, before 10K tracking started.
			</p>
		</div>
	{/if}
</div>
