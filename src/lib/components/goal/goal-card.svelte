<script lang="ts">
	import type { Goal, UserStats } from '$lib/server/trenara/types';
	import { onMount } from 'svelte';
	import { Trophy, Calendar, Target } from 'lucide-svelte';
	import PredictionChart, {
		type ChartDataPoint
	} from '$lib/components/charts/prediction-chart.svelte';
	import { timeStringToSeconds, paceStringToSeconds } from '$lib/utils/format';

	let { goal, userStats }: { goal: Goal; userStats: UserStats } = $props();

	// ── Dates & progress ───────────────────────────────────────────
	const now = new Date();
	const startDate = $derived(new Date(goal.start_date));
	const endDate = $derived(new Date(goal.end_date));
	const isPast = $derived(now > endDate);

	const totalDays = $derived(
		Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)))
	);
	const daysPassed = $derived(
		Math.max(0, Math.ceil((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)))
	);
	const progress = $derived(Math.min(100, Math.max(0, (daysPassed / totalDays) * 100)));

	const weeksRemaining = $derived(
		Math.max(0, Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 7)))
	);

	const formattedEndDate = $derived(
		endDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
	);

	// ── Prediction history & chart ─────────────────────────────────
	let chartData = $state<ChartDataPoint[]>([]);
	let chartLoading = $state(false);
	let chartError = $state<string | null>(null);

	/** Fetch prediction records from Supabase via our API. */
	async function loadPredictionHistory() {
		chartLoading = true;
		chartError = null;
		try {
			const params = new URLSearchParams({ limit: '200' });
			if (goal.start_date) params.set('startDate', goal.start_date);
			const res = await fetch(`/api/v1/prediction-history?${params}`);
			if (!res.ok) throw new Error(`Failed to load history (${res.status})`);
			const { records } = await res.json();
			chartData = transformRecords(records ?? []);
		} catch (e) {
			chartError = e instanceof Error ? e.message : 'Failed to load prediction history';
			chartData = [];
		} finally {
			chartLoading = false;
		}
	}

	interface PredictionRecord {
		id: number;
		user_id: number;
		predicted_time: string;
		predicted_pace: string;
		recorded_at: string;
		created_at: string;
	}

	function transformRecords(records: PredictionRecord[]): ChartDataPoint[] {
		return records
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
			.filter((d): d is ChartDataPoint => d !== null);
	}

	/** POST current prediction to the API; only stores if changed. */
	async function trackCurrentPrediction() {
		const time = userStats?.best_times?.time_for_goal;
		const rawPace = userStats?.best_times?.pace_for_goal;
		if (!time || !rawPace) return;
		// Strip any unit suffix (e.g. "min/km") before sending to API
		const pace = rawPace.replace(/\s*min\/km\s*/, '').trim();
		try {
			const res = await fetch('/api/v1/prediction-history', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ time, pace })
			});
			if (!res.ok) return; // non-critical, fail silently
			const result = await res.json();
			if (result.stored) {
				// Reload chart to include the new point
				await loadPredictionHistory();
			}
		} catch {
			// Prediction tracking is best-effort
		}
	}

	/** Archive completed goal to history (best-effort, fire-and-forget). */
	async function archiveCompletedGoal() {
		if (!isPast) return;
		const latest = await predictionHistoryDAO_getLatest();
		try {
			await fetch('/api/v1/goal-history', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					goal_name: goal.name,
					distance: goal.distance,
					goal_time: goal.time,
					goal_pace: goal.pace,
					final_predicted_time: latest?.time ?? userStats?.best_times?.time_for_goal ?? null,
					final_predicted_pace: latest?.pace ?? userStats?.best_times?.pace_for_goal?.replace(/\s*min\/km\s*/, '').trim() ?? null,
					start_date: goal.start_date,
					end_date: goal.end_date
				})
			});
		} catch {
			// Archiving is best-effort
		}
	}

	/** Fetch the latest prediction to use as final prediction for archiving. */
	async function predictionHistoryDAO_getLatest(): Promise<{ time: string; pace: string } | null> {
		try {
			const params = new URLSearchParams({ limit: '1' });
			const res = await fetch(`/api/v1/prediction-history?${params}`);
			if (!res.ok) return null;
			const { records } = await res.json();
			if (records?.length > 0) {
				return { time: records[records.length - 1].predicted_time, pace: records[records.length - 1].predicted_pace };
			}
			return null;
		} catch {
			return null;
		}
	}

	// Initialise on mount (browser-only; $effect can run during SSR in Svelte 5)
	onMount(() => {
		loadPredictionHistory();
		trackCurrentPrediction();
		archiveCompletedGoal();
	});
</script>

<div class="rounded-lg border border-border bg-card shadow-sm p-6">
	{#if isPast}
		<!-- Completed goal -->
		<div class="flex items-center gap-3 mb-4">
			<Trophy class="h-6 w-6 text-primary" />
			<h2 class="text-xl font-semibold text-card-foreground">Goal Completed</h2>
		</div>
		<p class="text-muted-foreground">
			You completed <span class="font-medium text-card-foreground">{goal.name}</span>
			({goal.distance}) on {formattedEndDate}.
		</p>

		<!-- Historical chart for completed goals -->
		<div class="mt-6">
			<div class="mb-2">
				<h3 class="text-sm font-medium text-muted-foreground">Historical Prediction Progress</h3>
			</div>
			<PredictionChart data={chartData} loading={chartLoading} error={chartError} />
		</div>
	{:else}
		<!-- Active goal -->
		<div class="flex items-center gap-3 mb-4">
			<Target class="h-6 w-6 text-primary" />
			<h2 class="text-xl font-semibold text-card-foreground">{goal.name}</h2>
		</div>

		<p class="text-sm text-muted-foreground mb-4">{goal.description}</p>

		<!-- Event info -->
		<div class="flex items-center gap-2 text-sm text-muted-foreground mb-6">
			<Calendar class="h-4 w-4" />
			<span>{formattedEndDate}</span>
			<span class="text-border">|</span>
			<span>{goal.distance}</span>
			<span class="text-border">|</span>
			<span>{weeksRemaining} weeks remaining</span>
		</div>

		<!-- Pace / Time table -->
		{#if userStats?.best_times}
			<div class="mb-6 overflow-hidden rounded-md border border-border">
				<table class="w-full text-sm">
					<thead>
						<tr class="border-b border-border bg-muted/50">
							<th class="px-4 py-2 text-left font-medium text-muted-foreground"></th>
							<th class="px-4 py-2 text-left font-medium text-muted-foreground">Time</th>
							<th class="px-4 py-2 text-left font-medium text-muted-foreground">Pace</th>
						</tr>
					</thead>
					<tbody>
						<tr class="border-b border-border">
							<td class="px-4 py-2 font-medium text-card-foreground">Goal</td>
							<td class="px-4 py-2 text-card-foreground">{goal.time}</td>
							<td class="px-4 py-2 text-card-foreground">{goal.pace}</td>
						</tr>
						<tr>
							<td class="px-4 py-2 font-medium text-card-foreground">Current Prediction</td>
							<td class="px-4 py-2 text-card-foreground">
								{userStats.best_times.time_for_goal ?? 'N/A'}
							</td>
							<td class="px-4 py-2 text-card-foreground">
								{userStats.best_times.pace_for_goal ?? 'N/A'}
							</td>
						</tr>
					</tbody>
				</table>
			</div>
		{:else}
			<div class="mb-6 rounded-md border border-border bg-muted/30 px-4 py-3">
				<p class="text-sm text-muted-foreground">
					No prediction data available yet. Complete some training to see your predictions.
				</p>
			</div>
		{/if}

		<!-- Progress bar -->
		<div class="mb-6">
			<div class="flex items-center justify-between mb-1.5">
				<span class="text-xs font-medium text-muted-foreground">Training Progress</span>
				<span class="text-xs font-medium text-muted-foreground">{Math.round(progress)}%</span>
			</div>
			<div class="h-2 w-full overflow-hidden rounded-full bg-muted">
				<div
					class="h-full rounded-full bg-primary transition-all duration-300"
					style="width: {progress}%"
				></div>
			</div>
			<div class="flex items-center justify-between mt-1.5">
				<span class="text-xs text-muted-foreground">
					Day {Math.min(daysPassed, totalDays)} of {totalDays}
				</span>
			</div>
		</div>

		<!-- Prediction chart -->
		<div>
			<div class="mb-2">
				<h3 class="text-sm font-medium text-muted-foreground">Prediction Progress</h3>
			</div>
			<PredictionChart data={chartData} loading={chartLoading} error={chartError} />
		</div>
	{/if}
</div>
