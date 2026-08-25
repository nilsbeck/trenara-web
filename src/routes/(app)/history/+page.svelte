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
		derived_time_10k: string | null;
		derived_pace_10k: string | null;
		recorded_at: string;
		created_at: string;
	}

	const records = $derived(data.records as PredictionRecord[]);

	/**
	 * Every row as a 10K time, recorded where the API gave one and derived where
	 * it did not.
	 *
	 * This chart spans every goal the runner has ever trained for, so it cannot
	 * plot the goal-distance prediction: a switch from a 15 km goal to a marathon
	 * would read as a collapse in fitness. The 10K column exists for that, but it
	 * only started recording recently, which left four comparable points against
	 * a hundred and sixty rows.
	 *
	 * The derived values are back-filled server-side into columns of their own,
	 * so which is which survives the trip here and can be said on screen.
	 */
	interface Point extends ChartDataPoint {
		derived: boolean;
	}

	function toPoint(r: PredictionRecord): Point | null {
		const recorded = r.predicted_time_10k !== null && r.predicted_pace_10k !== null;
		const time = recorded ? r.predicted_time_10k : r.derived_time_10k;
		const pace = recorded ? r.predicted_pace_10k : r.derived_pace_10k;
		if (time === null || pace === null) return null;

		try {
			return {
				date: r.recorded_at,
				predictedTime: timeStringToSeconds(time),
				predictedPace: paceStringToSeconds(pace),
				formattedTime: time,
				formattedPace: pace,
				derived: !recorded
			};
		} catch {
			return null;
		}
	}

	const points = $derived(
		records.map(toPoint).filter((p): p is Point => p !== null && Number.isFinite(p.predictedTime))
	);
	const derivedCount = $derived(points.filter((p) => p.derived).length);
	const unreadableCount = $derived(records.length - points.length);

	// Defer chart rendering to after mount so the page shell paints instantly
	let chartReady = $state(false);
	let chartData = $state<ChartDataPoint[]>([]);

	onMount(() => {
		chartData = points;
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
			{points.length} record{points.length !== 1 ? 's' : ''}
		</span>
	</div>

	<!-- Chart -->
	<div class="rounded-lg border border-border bg-card p-6 shadow-sm">
		<h2 class="text-sm font-medium text-muted-foreground">All-Time 10K Prediction Progress</h2>
		<p class="mb-4 mt-1 text-xs text-muted-foreground">
			Measured against a fixed 10K distance so progress stays comparable across goals.
			{#if derivedCount > 0}
				{derivedCount} of these {derivedCount === 1 ? 'was' : 'were'} converted from the goal-distance
				prediction recorded that day, rather than a 10K the API gave us.
			{/if}
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
	{:else if unreadableCount > 0}
		<div class="rounded-lg border border-border bg-card p-4 text-center shadow-sm mt-6">
			<p class="text-sm text-muted-foreground">
				{unreadableCount} record{unreadableCount !== 1 ? 's are' : ' is'} not shown: the time and pace
				stored do not imply a distance to convert from.
			</p>
		</div>
	{/if}
</div>
