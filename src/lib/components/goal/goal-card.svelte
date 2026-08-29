<script lang="ts">
	import type { Goal, UserStats } from '$lib/server/trenara/types';
	import { onMount } from 'svelte';
	import { Trophy, Calendar, Target, ChevronLeft, ChevronRight } from 'lucide-svelte';
	import PredictionChart, {
		type ChartDataPoint
	} from '$lib/components/charts/prediction-chart.svelte';
	import DistanceChart from '$lib/components/charts/distance-chart.svelte';
	import { readWeekDistance, readGoalDistance } from '$lib/utils/distance-graph';
	import { forecast, earnCutoff, type ForecastPoint } from '$lib/utils/forecast';
	import { readPlanWeeks } from '$lib/utils/plan-weeks';
	import {
		timeStringToSeconds,
		paceStringToSeconds,
		formatSignedDuration,
		secondsToTimeString,
		secondsToPaceString
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

	// ── Which graph is on show ─────────────────────────────────────
	//
	// Prediction is the default: it is the one that answers "am I going to make
	// it", which is what this card is for. The two distance graphs answer "what
	// have I actually done", and are a click away.

	type GraphView = 'prediction' | 'week' | 'goal';

	// The picker is the heading — these read as titles, not as verbs.
	const GRAPH_VIEWS: { value: GraphView; label: string }[] = [
		{ value: 'prediction', label: 'Prediction Progress' },
		{ value: 'week', label: 'Distance This Week' },
		{ value: 'goal', label: 'Distance By Week' }
	];

	let graphView = $state<GraphView>('prediction');

	// The arrows and the picker are the same control in two shapes: the picker
	// says where you are and jumps anywhere, the arrows step. Three graphs is a
	// short enough ring to wrap rather than dead-end, which also keeps the back
	// arrow live on the view the card opens on.
	const graphIndex = $derived(GRAPH_VIEWS.findIndex((v) => v.value === graphView));
	const previousGraph = $derived(
		GRAPH_VIEWS[(graphIndex - 1 + GRAPH_VIEWS.length) % GRAPH_VIEWS.length]
	);
	const nextGraph = $derived(GRAPH_VIEWS[(graphIndex + 1) % GRAPH_VIEWS.length]);

	function stepGraph(to: { value: GraphView }) {
		graphView = to.value;
	}

	// Both distance graphs read the stats this card already has — no fetch, so
	// switching between them costs nothing and there is no loading state.
	const weekSeries = $derived(readWeekDistance(userStats?.graph_stats?.weeks));
	const goalSeries = $derived(readGoalDistance(userStats?.graph_stats?.goal));

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

	const raceDay = $derived(goal.end_date ? new Date(goal.end_date) : null);

	/**
	 * Where this runner lands on race day, given what they have actually done.
	 *
	 * The live prediction is the starting point because it has already absorbed
	 * every session run and skipped; the remaining plan supplies the volume; the
	 * rate is what a kilometre has been worth to this runner, or what the plan
	 * intends one to be worth when there is not enough history to measure. See
	 * `forecast`.
	 */
	const raceForecast = $derived.by(() => {
		const predicted = userStats?.best_times?.time_for_goal;
		if (!raceDay || isPast || !predicted || !goal.time_in_sec) return null;

		const plan = readPlanWeeks(userStats?.graph_stats?.goal);
		if (plan.weeks.length === 0) return null;

		// `completedKm` is null for "no data" as well as for a week that has not
		// happened, and the two are not the same thing. Reading null as zero is
		// the conservative way round: an unsynced week looks like a missed one,
		// which can only make the measured rate fail its own fit test and hand
		// the forecast back to the plan's design rate. The opposite mistake would
		// credit training nobody did.
		return forecast({
			nowSeconds: timeStringToSeconds(predicted),
			now,
			goalSeconds: goal.time_in_sec,
			raceDay,
			planned: plan.weeks.map((w) => ({ startsOn: w.startsOn, km: w.plannedKm })),
			done: plan.weeks.map((w) => ({ startsOn: w.startsOn, km: w.completedKm ?? 0 })),
			samples: chartData.map((d) => ({ date: d.date, seconds: d.predictedTime })),
			goalStart: startDate
		});
	});

	/**
	 * What the forecast rests on, in as few words as it can be said.
	 *
	 * A projected time with nothing behind it is a number to be believed or
	 * disbelieved and nothing else. Three things decide whether it is worth
	 * believing — how much training is left that still counts, what a kilometre
	 * of it is priced at, and whether that price was measured or assumed — and
	 * none of them needs a clause to carry it.
	 */
	const forecastBasis = $derived.by(() => {
		if (!raceForecast) return null;
		const { rate, remainingKm, askedToDateKm, doneToDateKm } = raceForecast;

		const price = `${rate.secondsPerKm.toFixed(2)}s/km`;
		const basis =
			rate.source === 'observed'
				? `your measured ${price}`
				: `the plan's ${price} (not enough history for yours)`;

		const done =
			askedToDateKm > 0
				? ` ${Math.round(doneToDateKm)} of ${Math.round(askedToDateKm)} km run so far.`
				: '';

		return `${Math.round(remainingKm)} km left that still counts, at ${basis}.${done}`;
	});

	/**
	 * The shortfall as a pace.
	 *
	 * A finish time is what the goal is written in, but it is not what anybody
	 * runs. "4:31 short" over a whole race is a number you have to divide before
	 * it means anything; the seconds per kilometre behind it is the thing a
	 * runner can feel on the next rep.
	 *
	 * Null when the goal carries no distance, and there is nothing to divide by.
	 */
	const shortfallPerKm = $derived(
		raceForecast && goal.distance_value ? raceForecast.shortfallSeconds / goal.distance_value : null
	);

	/** A second per kilometre either way is the goal, not a miss. */
	const ON_GOAL_PER_KM = 1;

	const onGoalPace = $derived(
		shortfallPerKm === null
			? (raceForecast?.shortfallSeconds ?? 0) <= 30
			: shortfallPerKm <= ON_GOAL_PER_KM
	);

	/** `18s/km`, or `1:05/km` once it runs past a minute. */
	function perKm(seconds: number): string {
		const total = Math.round(Math.abs(seconds));
		return total >= 60
			? `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}/km`
			: `${total}s/km`;
	}

	/** How far short the remaining work lands, once it is worth mentioning. */
	const shortfallNote = $derived.by(() => {
		if (!raceForecast) return null;

		// No distance to divide by: fall back to the finish time, which is at
		// least a number, rather than saying nothing.
		if (shortfallPerKm === null) {
			const short = raceForecast.shortfallSeconds;
			if (short > 30) return `${formatSignedDuration(short).replace('+', '')} short of the goal.`;
			if (short < -30) return `${formatSignedDuration(-short).replace('+', '')} inside the goal.`;
			return 'On the goal, if you follow the rest of the plan.';
		}

		if (shortfallPerKm > ON_GOAL_PER_KM) return `${perKm(shortfallPerKm)} short of goal pace.`;
		if (shortfallPerKm < -ON_GOAL_PER_KM) return `${perKm(shortfallPerKm)} inside goal pace.`;
		return 'On goal pace, if you follow the rest of the plan.';
	});

	/**
	 * What a forecast point is standing on, in the two lines a tooltip has room
	 * for.
	 *
	 * The chart deals in seconds and dates; kilometres are this card's business,
	 * so the wording is written here. Every vertex of the line is a week of the
	 * plan, and the number that put it where it is is that week's distance —
	 * without it, a bend is just a bend.
	 */
	function forecastDetail(point: ForecastPoint): string[] {
		const since = `${Math.round(point.kmToDate)} km since today`;
		switch (point.kind) {
			// The date is already the tooltip's heading, so "today" would be the
			// same word twice, and race day has no training left to report.
			case 'today':
				return [];
			case 'race':
				return ['Race day'];
			case 'cutoff':
				return ['Last training that counts', since];
			default:
				return [`${Math.round(point.segmentKm)} km this week`, since];
		}
	}

	const chartLines = $derived(
		raceForecast
			? [
					{
						label: 'Forecast',
						colour: '#ec4899',
						points: raceForecast.points.map((point) => ({
							date: point.date,
							seconds: point.seconds,
							detail: forecastDetail(point)
						}))
					}
				]
			: []
	);

	/** The weekly volume the forecast is priced from, drawn under it. */
	const chartLoad = $derived(raceForecast?.load ?? []);

	const goalReference = $derived(
		goal.time_in_sec ? { seconds: goal.time_in_sec, label: `Goal ${goal.time}` } : null
	);

	/**
	 * Why there is no forecast, when there is no forecast.
	 *
	 * A chart that silently declines to forecast is indistinguishable from one
	 * that is broken. Every reason below is a real state with a real remedy, and
	 * saying which one applies is the difference between waiting for something
	 * and wondering whether it works.
	 */
	const noForecastReason = $derived.by(() => {
		if (raceForecast || isPast || chartLoading || chartError) return null;
		if (!userStats?.best_times?.time_for_goal || !goal.time_in_sec) {
			return 'No prediction to forecast from yet.';
		}
		if (readPlanWeeks(userStats?.graph_stats?.goal).weeks.length === 0) {
			return 'No plan weeks to forecast against yet.';
		}
		if (chartData.length === 0) {
			return 'No prediction recorded yet for this goal — the forecast needs at least one earlier reading to price the plan against.';
		}
		if (raceDay && earnCutoff(raceDay) <= now) {
			return 'Race week: training from here changes how fresh you are, not how fast, so there is nothing left to forecast.';
		}
		return 'Not enough of this block on record yet to forecast — the earliest reading is too recent to tell whether you are keeping pace.';
	});

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

		try {
			const res = await fetch('/api/v1/prediction-history', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ time, pace, ...reference })
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
			{@render graphPicker()}
			{@render graph()}
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
							<tr
								class:border-b={raceForecast !== null}
								class:border-border={raceForecast !== null}
							>
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
						<!--
							The number the card exists to give: not where the prediction is
							today, but where the training still left can carry it by race
							day. Highlighted when that reaches the goal, because reaching it
							is the whole point of the plan and worth seeing at a glance.
						-->
						{#if raceForecast}
							{@const onGoal = onGoalPace}
							<tr>
								<td class="px-4 py-2 font-medium text-card-foreground">Projected on race day</td>
								<td class="px-4 py-2 font-medium tabular-nums" class:text-primary={onGoal}>
									{secondsToTimeString(Math.round(raceForecast.endSeconds))}
								</td>
								<td class="px-4 py-2 tabular-nums text-muted-foreground">
									{goal.distance_value
										? `${secondsToPaceString(Math.round(raceForecast.endSeconds / goal.distance_value))} /km`
										: ''}
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

		<!-- Prediction / distance chart -->
		<div>
			{@render graphPicker()}
			{@render graph()}
		</div>
	{/if}
</div>

<!--
	The card's own heading, which is also the control that swaps the graph under
	it. One element rather than a title beside a picker: they said the same
	thing, and the native select carries its own affordance.

	The arrows step through the same three graphs without opening anything —
	the quicker move when you just want to see the next one. Each names the
	graph it goes to, so the label is useful rather than "previous".

	They sit at the far edge rather than against the picker: the heading reads
	as a heading that way, and the arrows land where the eye looks for graph
	controls instead of crowding the title.
-->
{#snippet graphPicker()}
	<div class="mb-2 flex items-center justify-between gap-2">
		<label>
			<span class="sr-only">Which graph to show</span>
			<select
				bind:value={graphView}
				class="-ml-1 cursor-pointer rounded-md border-0 bg-transparent py-0.5 pl-1 pr-6 text-sm font-medium text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
			>
				{#each GRAPH_VIEWS as view}
					<option value={view.value}>{view.label}</option>
				{/each}
			</select>
		</label>
		<div class="flex shrink-0 items-center gap-1">
			<button
				type="button"
				onclick={() => stepGraph(previousGraph)}
				aria-label="Show {previousGraph.label}"
				class="rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
			>
				<ChevronLeft class="h-4 w-4" />
			</button>
			<button
				type="button"
				onclick={() => stepGraph(nextGraph)}
				aria-label="Show {nextGraph.label}"
				class="rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
			>
				<ChevronRight class="h-4 w-4" />
			</button>
		</div>
	</div>
{/snippet}

{#snippet graph()}
	{#if graphView === 'week'}
		<DistanceChart series={weekSeries} emptyMessage="No distance planned for this week" />
	{:else if graphView === 'goal'}
		<DistanceChart series={goalSeries} emptyMessage="No weekly distances for this goal yet" />
	{:else}
		<PredictionChart
			data={chartData}
			loading={chartLoading}
			error={chartError}
			domainEnd={raceDay}
			projections={chartLines}
			reference={goalReference}
			load={chartLoad}
		/>
	{/if}

	<!--
		The forecast note reads only under the prediction graph — the distance
		graphs answer a different question, and a race-day time sitting under a
		chart of kilometres would read as a caption for it.

		Its room is kept under all three. Letting it appear and vanish resized the
		card every time the picker moved, which is the jump this box exists to
		absorb.
	-->
	<div class="min-h-[3.75rem]">
		{#if graphView === 'prediction'}
			{#if raceForecast}
				<p class="mt-2 text-xs leading-relaxed text-card-foreground">{shortfallNote}</p>
				<p class="mt-1 text-xs leading-relaxed text-muted-foreground">{forecastBasis}</p>
			{:else if noForecastReason}
				<p class="mt-2 text-xs leading-relaxed text-muted-foreground">{noForecastReason}</p>
			{/if}
		{/if}
	</div>
{/snippet}
