<script lang="ts">
	import type { Goal, UserStats } from '$lib/server/trenara/types';
	import { onMount } from 'svelte';
	import { Trophy, Calendar, Target } from 'lucide-svelte';
	import {
		linearTrend,
		project,
		complianceRate,
		planTrajectory,
		MIN_FIT
	} from '$lib/utils/projection';
	import { readPlanWeeks } from '$lib/utils/plan-weeks';
	import { mondayOf } from '$lib/utils/date';
	import PredictionChart, {
		type ChartDataPoint
	} from '$lib/components/charts/prediction-chart.svelte';
	import {
		timeStringToSeconds,
		paceStringToSeconds,
		formatSignedDuration
	} from '$lib/utils/format';

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

	/**
	 * How far the current prediction sits from the goal itself.
	 *
	 * Both numbers were already on this card, in adjacent rows, and nobody was
	 * doing the subtraction. Positive is behind the goal.
	 */
	const gap = $derived.by(() => {
		const predicted = userStats?.best_times?.time_for_goal;
		if (!predicted || !goal.time) return null;

		const predictedSeconds = timeStringToSeconds(predicted);
		const goalSeconds = goal.time_in_sec || timeStringToSeconds(goal.time);
		if (!predictedSeconds || !goalSeconds) return null;

		const predictedPace = userStats?.best_times?.pace_for_goal;
		const paceGap =
			predictedPace && goal.pace
				? paceStringToSeconds(predictedPace) - paceStringToSeconds(goal.pace)
				: null;

		return {
			time: predictedSeconds - goalSeconds,
			pace: paceGap,
			ahead: predictedSeconds < goalSeconds
		};
	});

	/**
	 * Where the prediction lands on race day, drawn two ways.
	 *
	 * Both are arithmetic on past behaviour rather than a figure the API gives,
	 * and each line says so where it ends. Nothing is drawn at all below a real
	 * stretch of history — see `linearTrend`.
	 *
	 * The gap between the two is what the missed weeks cost: one carries the rate
	 * the runner has actually managed, the other the rate that completing the
	 * rest of the plan might buy.
	 */
	const raceDay = $derived(goal.end_date ? new Date(goal.end_date) : null);

	/**
	 * What following the plan asks for, week by week.
	 *
	 * A reading of the plan rather than a forecast of a body: the plan exists to
	 * put a runner on their goal on race day, and the weeks between here and
	 * there have known loads, so the improvement it is asking for can be said in
	 * seconds — unevenly, since a 56 km week is asked for more than a 37 km one.
	 *
	 * It does not depend on the recorded predictions having gone anywhere, which
	 * is the point: a runner who has stalled still has a plan in front of them.
	 */
	const planAsk = $derived.by(() => {
		const predicted = userStats?.best_times?.time_for_goal;
		if (!raceDay || isPast || !predicted || !goal.time_in_sec || !goal.distance_value) return null;

		const plan = readPlanWeeks(userStats?.graph_stats?.goal);
		const thisMonday = mondayOf(now).getTime();
		const remaining = plan.weeks
			.filter((w) => w.startsOn.getTime() >= thisMonday)
			.map((w) => ({ startsOn: w.startsOn, plannedKm: w.plannedKm }));

		return planTrajectory({
			from: timeStringToSeconds(predicted),
			fromDate: now,
			goalSeconds: goal.time_in_sec,
			weeks: remaining,
			distanceKm: goal.distance_value
		});
	});

	/** The ask in a sentence: what a typical week wants, and the range across them. */
	const planAskSummary = $derived.by(() => {
		if (!planAsk || planAsk.steps.length === 0) return null;

		const perWeek = planAsk.steps.map((s) => s.gainPaceSeconds);
		const low = Math.round(Math.min(...perWeek));
		const high = Math.round(Math.max(...perWeek));
		const weeks = planAsk.steps.length;

		return low === high
			? `Following the plan asks for ${high}s/km a week over the ${weeks} weeks that still count.`
			: `Following the plan asks for ${low}–${high}s/km a week over the ${weeks} weeks that still count — most in the big weeks, none in race week.`;
	});

	const projections = $derived.by(() => {
		if (!raceDay || isPast || chartData.length === 0) return [];

		const trend = linearTrend(chartData.map((d) => ({ date: d.date, seconds: d.predictedTime })));
		// Enough history is not the same as a trend. A prediction that has wandered
		// around one value all block explains nothing, and a line drawn through it
		// would read as a finding rather than as the noise it is.
		if (!trend || trend.rSquared < MIN_FIT) return [];

		const plan = readPlanWeeks(userStats?.graph_stats?.goal);
		const rate = complianceRate(plan.totalCompletedKm, plan.totalPlannedKm);

		const asIs = project(trend, raceDay, { label: 'projected · current rate' });
		if (!asIs) return [];

		const asPlanned =
			rate > 1 ? project(trend, raceDay, { label: 'projected · plan completed', rate }) : null;

		// Two lines are only worth two lines when they end up somewhere different.
		// Below half a minute apart they overlay each other, and the only thing
		// the second one adds is a second label in the same place.
		const worthBoth = asPlanned !== null && Math.abs(asPlanned.endSeconds - asIs.endSeconds) >= 30;

		return [
			{ label: asIs.label, colour: '#94a3b8', points: asIs.points },
			...(worthBoth && asPlanned
				? [{ label: asPlanned.label, colour: '#22c55e', points: asPlanned.points }]
				: [])
		];
	});

	/**
	 * The plan's ask first, the trend behind it.
	 *
	 * The ask is drawn whenever there is a plan left to follow. The trend only
	 * when the recorded predictions have actually done something — see
	 * `MIN_FIT`.
	 */
	const chartLines = $derived([
		...(planAsk ? [{ label: 'the plan asks', colour: '#22c55e', points: planAsk.points }] : []),
		...projections
	]);

	const goalReference = $derived(
		goal.time_in_sec ? { seconds: goal.time_in_sec, label: `Goal ${goal.time}` } : null
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
		predicted_time_10k: string | null;
		predicted_pace_10k: string | null;
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

	/** Strip any unit suffix (e.g. "min/km") before sending a pace to the API. */
	function stripPaceUnit(pace: string): string {
		return pace.replace(/\s*min\/km\s*/, '').trim();
	}

	/**
	 * POST current prediction to the API; only stores if changed.
	 *
	 * Sends both the goal-distance prediction (what this card's chart plots) and
	 * the 10K prediction, which the all-time history uses as a fixed reference so
	 * the series stays comparable across goals of different distances.
	 */
	async function trackCurrentPrediction() {
		const time = userStats?.best_times?.time_for_goal;
		const rawPace = userStats?.best_times?.pace_for_goal;
		if (!time || !rawPace) return;
		const pace = stripPaceUnit(rawPace);

		const time10k = userStats?.best_times?.time_for_10;
		const rawPace10k = userStats?.best_times?.pace_for_10;
		const reference =
			time10k && rawPace10k ? { time_10k: time10k, pace_10k: stripPaceUnit(rawPace10k) } : {};

		// The rest of what the same response predicted. Recording them now is what
		// stops a later question about any of these distances being answered by
		// inference from the two we happened to keep.
		const set = {
			...(userStats?.best_times?.time_for_5 ? { time_5k: userStats.best_times.time_for_5 } : {}),
			...(userStats?.best_times?.time_for_half_marathon
				? { time_half: userStats.best_times.time_for_half_marathon }
				: {}),
			...(userStats?.best_times?.time_for_marathon
				? { time_marathon: userStats.best_times.time_for_marathon }
				: {})
		};

		try {
			const res = await fetch('/api/v1/prediction-history', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ time, pace, ...reference, ...set })
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

	/**
	 * Archive the current goal to history (best-effort, fire-and-forget).
	 *
	 * Runs for active goals too, not just completed ones: Trenara's /api/goal
	 * only ever returns the goal that is current right now, so a goal that is
	 * replaced before anyone opens this page after its end date would otherwise
	 * be lost for good. The API upserts on (user, name, end date), so repeat
	 * visits refresh the stored final prediction instead of piling up rows.
	 */
	async function archiveGoal() {
		const latest = await getLatestPrediction();
		try {
			const res = await fetch('/api/v1/goal-history', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					goal_name: goal.name,
					distance: goal.distance,
					goal_time: goal.time,
					goal_pace: stripPaceUnit(goal.pace),
					final_predicted_time: latest?.time ?? userStats?.best_times?.time_for_goal ?? null,
					final_predicted_pace:
						latest?.pace ??
						(userStats?.best_times?.pace_for_goal
							? stripPaceUnit(userStats.best_times.pace_for_goal)
							: null),
					start_date: goal.start_date,
					end_date: goal.end_date
				})
			});
			if (!res.ok) {
				// Not fatal, but silent failures here are why history stays empty.
				console.warn(`Failed to archive goal (${res.status}): ${await res.text()}`);
			}
		} catch (e) {
			console.warn('Failed to archive goal:', e);
		}
	}

	/** Fetch the latest prediction to use as final prediction for archiving. */
	async function getLatestPrediction(): Promise<{ time: string; pace: string } | null> {
		try {
			const params = new URLSearchParams({ limit: '1' });
			const res = await fetch(`/api/v1/prediction-history?${params}`);
			if (!res.ok) return null;
			const { records } = await res.json();
			if (records?.length > 0) {
				return {
					time: records[records.length - 1].predicted_time,
					pace: records[records.length - 1].predicted_pace
				};
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
		archiveGoal();
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

		<!-- Guarded because the API no longer sends a description: an unguarded
		     paragraph was an empty block holding a margin open under the name. -->
		{#if goal.description}
			<p class="text-sm text-muted-foreground mb-4">{goal.description}</p>
		{/if}

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
						<tr class:border-b={gap !== null} class:border-border={gap !== null}>
							<td class="px-4 py-2 font-medium text-card-foreground">Current Prediction</td>
							<td class="px-4 py-2 text-card-foreground">
								{userStats.best_times.time_for_goal ?? 'N/A'}
							</td>
							<td class="px-4 py-2 text-card-foreground">
								{userStats.best_times.pace_for_goal ?? 'N/A'}
							</td>
						</tr>
						<!--
							The subtraction nobody was doing: the two rows above have sat
							next to each other saying nothing about the distance between
							them. Ahead of the goal is an ordinary state, so it is coloured
							as good news rather than treated as an anomaly.
						-->
						{#if gap}
							<tr>
								<td class="px-4 py-2 font-medium text-muted-foreground">
									{gap.ahead ? 'Ahead by' : 'To find'}
								</td>
								<td class="px-4 py-2 tabular-nums" class:text-primary={gap.ahead}>
									{formatSignedDuration(gap.time)}
								</td>
								<td class="px-4 py-2 tabular-nums text-muted-foreground">
									{gap.pace === null ? '' : `${formatSignedDuration(gap.pace)} /km`}
								</td>
							</tr>
						{/if}
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
			<PredictionChart
				data={chartData}
				loading={chartLoading}
				error={chartError}
				domainEnd={raceDay}
				projections={chartLines}
				reference={goalReference}
				distanceKm={goal.distance_value}
			/>
			{#if planAskSummary}
				<p class="mt-2 text-xs leading-relaxed text-muted-foreground">{planAskSummary}</p>
			{/if}
		</div>
	{/if}
</div>
