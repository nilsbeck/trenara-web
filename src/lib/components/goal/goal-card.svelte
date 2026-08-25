<script lang="ts">
	import type { Goal, UserStats } from '$lib/server/trenara/types';
	import { onMount } from 'svelte';
	import { Trophy, Calendar, Target } from 'lucide-svelte';
	import { forecast, earnCutoff } from '$lib/utils/forecast';
	import { readPlanWeeks } from '$lib/utils/plan-weeks';
	import PredictionChart, {
		type ChartDataPoint
	} from '$lib/components/charts/prediction-chart.svelte';
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
	 * Where this runner lands on race day, given what they have actually done.
	 *
	 * One line, not three. The earlier version drew a trend through the recorded
	 * predictions and a second, brighter copy of it scaled up for "if you had
	 * followed the plan" — two lines about the past, neither of which answered
	 * the only question worth asking on a goal card, which is where the training
	 * still ahead can get to.
	 *
	 * The live prediction is the starting point because it has already absorbed
	 * every session run and skipped; the remaining plan supplies the volume; the
	 * rate is what a kilometre has been worth to this runner, or what the plan
	 * intends one to be worth when there is not enough history to measure. See
	 * `forecast`.
	 */
	const raceDay = $derived(goal.end_date ? new Date(goal.end_date) : null);

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
	 * What the forecast rests on, said plainly.
	 *
	 * A projected time with nothing behind it is a number to be believed or
	 * disbelieved and nothing else. These are the three things that decide
	 * whether it is worth believing: how much training is left that can still
	 * change it, what a kilometre of it is being priced at, and how that price
	 * was arrived at.
	 */
	const forecastBasis = $derived.by(() => {
		if (!raceForecast) return null;
		const { rate, remainingKm, askedToDateKm, doneToDateKm } = raceForecast;

		const basis =
			rate.source === 'observed'
				? `your own rate of ${rate.secondsPerKm.toFixed(2)}s per km over ${rate.intervals} measured stretches`
				: `the plan's own rate of ${rate.secondsPerKm.toFixed(2)}s per km, for want of enough history to measure yours`;

		const compliance =
			askedToDateKm > 0
				? ` So far you have run ${Math.round(doneToDateKm)} of the ${Math.round(askedToDateKm)} km the plan asked for.`
				: '';

		return `Based on ${Math.round(remainingKm)} km still to run that can change race-day fitness, at ${basis}.${compliance}`;
	});

	/** How far short the remaining work lands, once it is worth mentioning. */
	const shortfallNote = $derived.by(() => {
		if (!raceForecast) return null;
		const short = raceForecast.shortfallSeconds;
		if (short > 30) {
			return `That is ${formatSignedDuration(short).replace('+', '')} short of the goal — the weeks already missed cannot be run again.`;
		}
		if (short < -30) {
			return `That is ${formatSignedDuration(-short).replace('+', '')} inside the goal, if the rest of the plan is followed.`;
		}
		return 'That lands on the goal, if the rest of the plan is followed.';
	});

	const chartLines = $derived(
		raceForecast
			? [{ label: 'if you follow the plan', colour: '#22c55e', points: raceForecast.points }]
			: []
	);

	/**
	 * Why there is no line, when there is no line.
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
			<PredictionChart
				data={chartData}
				loading={chartLoading}
				error={chartError}
				distanceKm={goal.distance_value}
			/>
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
							{@const onGoal = raceForecast.shortfallSeconds <= 30}
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
			{#if raceForecast}
				<p class="mt-2 text-xs leading-relaxed text-card-foreground">{shortfallNote}</p>
				<p class="mt-1 text-xs leading-relaxed text-muted-foreground">{forecastBasis}</p>
			{:else if noForecastReason}
				<p class="mt-2 text-xs leading-relaxed text-muted-foreground">{noForecastReason}</p>
			{/if}
		</div>
	{/if}
</div>
