<script lang="ts">
	import type { Goal, UserStats } from '$lib/server/trenara/types';
	import { untrack, type Snippet } from 'svelte';
	import {
		Trophy,
		Calendar,
		Target,
		ChevronLeft,
		ChevronRight,
		ChevronDown,
		TrendingDown,
		TrendingUp,
		Minus
	} from 'lucide-svelte';
	import PredictionStats from './prediction-stats.svelte';
	import PredictionChart, {
		type ChartDataPoint
	} from '$lib/components/charts/prediction-chart.svelte';
	import DistanceChart from '$lib/components/charts/distance-chart.svelte';
	import { readWeekDistance, readGoalDistance } from '$lib/utils/distance-graph';
	import { forecast, earnCutoff, type ForecastPoint } from '$lib/utils/forecast';
	import { readPlanWeeks } from '$lib/utils/plan-weeks';
	import { paceTrend, splitByGoalDistance } from '$lib/utils/prediction-graph';
	import { impliedDistanceKm } from '$lib/utils/race-equivalent';
	import { toDate, weeksRemaining } from '$lib/utils/date';
	import {
		timeStringToSeconds,
		paceStringToSeconds,
		formatSignedDuration,
		secondsToTimeString,
		secondsToPaceString,
		shortenPaceUnit,
		NO_VALUE
	} from '$lib/utils/format';

	/**
	 * What the card actually reads off a goal — nothing about editing it,
	 * intermediate goals, or the plan's raw week template.
	 *
	 * Exported so a caller can be checked against it rather than against a
	 * promise: a shared-goal snapshot (`$lib/server/share/snapshot.ts`) is
	 * built to satisfy exactly this, and if a future change to this component
	 * reads a field the snapshot does not carry, that caller stops
	 * type-checking instead of failing silently on a public page.
	 */
	export type GoalCardGoal = Pick<
		Goal,
		| 'name'
		| 'start_date'
		| 'end_date'
		| 'distance'
		| 'distance_unit'
		| 'distance_value'
		| 'time'
		| 'time_in_sec'
		| 'pace'
	> & { description?: string };

	/** What the card reads off the stats response. See `GoalCardGoal`. */
	export type GoalCardStats = {
		best_times?: Partial<UserStats['best_times']>;
		graph_stats?: Partial<UserStats['graph_stats']>;
	};

	/** Which graphs the picker offers. */
	export type GraphView = 'prediction' | 'week' | 'goal';

	let {
		goal,
		userStats,
		history,
		historyError = null,
		views = ['prediction', 'week', 'goal'],
		collapsible = false,
		expanded = true,
		ontoggle,
		bodyId = 'goal-card-body',
		headerExtra
	}: {
		goal: GoalCardGoal;
		userStats: GoalCardStats;
		/**
		 * The prediction history to plot. Required — the card does not fetch it.
		 *
		 * This is what makes the card renderable for a visitor with no session:
		 * it used to fetch its own history on mount and fire two best-effort
		 * writes alongside it (record today's prediction, archive the current
		 * goal), and all three of those calls are authenticated and would 401
		 * off-session. Both callers — the dashboard and `/goal` — read this
		 * from their own server load now, which is also where the two writes
		 * moved to (`keepHistory`), and the shared page supplies its own from
		 * the share row's owner. There is no `readOnly` flag: handing every
		 * caller its data the same way is what keeps this one component rather
		 * than two behaviours picked by whether an argument was passed.
		 */
		history: ChartDataPoint[];
		/** Set when the caller could not read the history — shown inline, not as a failed page. */
		historyError?: string | null;
		/**
		 * Which graphs the picker offers. All three by default; the shared page
		 * passes `['prediction']`, and with one view available the picker
		 * collapses to its title and the arrows are not rendered.
		 */
		views?: GraphView[];
		/**
		 * Whether this card folds down to its head on a phone.
		 *
		 * Off by default, which is what the dedicated `/goal` page wants: it has
		 * nothing to share the screen with, so there is nothing to fold away
		 * from. The dashboard turns it on, where the card is stacked above a
		 * month of calendar.
		 *
		 * Only ever below `sm`. Above it the card is a column of its own beside
		 * the calendar and is always open, so the control and the head's summary
		 * both go — see the class strings below.
		 */
		collapsible?: boolean;
		expanded?: boolean;
		ontoggle?: () => void;
		/** Id of the folding region, for the head's `aria-controls`. */
		bodyId?: string;
		/**
		 * Extra control in the header, beside the trend badge — the share
		 * button on `/goal`. A snippet rather than a boolean so the card itself
		 * carries no knowledge of sharing; the dashboard's copy simply never
		 * passes one.
		 */
		headerExtra?: Snippet;
	} = $props();

	/**
	 * The head's summary and the body take turns, and the animation is the two
	 * of them changing places: one folds to nothing over the same 300ms the
	 * other unfolds. `grid-template-rows` between `0fr` and `1fr` is what makes
	 * a height that has to be measured animatable at all; the inner
	 * `overflow-hidden` is what the row clips against.
	 *
	 * `invisible` rather than a clipped height alone, because a row clipped to
	 * zero still holds focusable controls and still reads aloud — the graph
	 * picker and its arrows would be tabbable through a closed card. It is the
	 * one part `lg` has to put back, or the body is laid out and never shown.
	 */
	const FOLD =
		'grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none';
	const OPEN = 'visible grid-rows-[1fr] opacity-100';
	const SHUT = 'invisible grid-rows-[0fr] opacity-0';

	const bodyClass = $derived(
		collapsible
			? `${FOLD} ${expanded ? OPEN : SHUT} lg:visible lg:grid-rows-[1fr] lg:opacity-100`
			: ''
	);
	const headClass = $derived(
		collapsible ? `${FOLD} ${expanded ? SHUT : OPEN} lg:hidden` : 'hidden'
	);
	const clip = $derived(collapsible ? 'overflow-hidden lg:overflow-visible' : '');

	const predictedPace = $derived(
		userStats?.best_times?.pace_for_goal
			? shortenPaceUnit(userStats.best_times.pace_for_goal)
			: null
	);

	// ── Dates & progress ───────────────────────────────────────────
	const now = new Date();

	// Read rather than trusted: an unreadable date used to reach the screen as
	// "Invalid Date", a bar of `NaN%` width and a "Day NaN of NaN" underneath
	// it, because every sum below is a subtraction of two of these.
	const startDate = $derived(toDate(goal.start_date));
	const endDate = $derived(toDate(goal.end_date));
	const isPast = $derived(endDate !== null && now > endDate);

	/** The length of the plan in days, or null when the dates do not give one. */
	const totalDays = $derived(
		startDate && endDate
			? Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)))
			: null
	);
	const daysPassed = $derived(
		startDate
			? Math.max(0, Math.ceil((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)))
			: null
	);

	/** Null rather than 0 when the span is unknown: an empty bar is a claim too. */
	const progress = $derived(
		totalDays !== null && daysPassed !== null
			? Math.min(100, Math.max(0, (daysPassed / totalDays) * 100))
			: null
	);

	// Shared with the dashboard's collapsed strip, which makes the same claim
	// about the same goal a few pixels above this card.
	const weeksLeft = $derived(endDate ? weeksRemaining(endDate, now) : null);

	const formattedEndDate = $derived(
		endDate
			? endDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
			: NO_VALUE
	);

	// ── Which graph is on show ─────────────────────────────────────
	//
	// Prediction is the default: it is the one that answers "am I going to make
	// it", which is what this card is for. The two distance graphs answer "what
	// have I actually done", and are a click away.

	// The picker is the heading — these read as titles, not as verbs.
	const ALL_GRAPH_VIEWS: { value: GraphView; label: string }[] = [
		{ value: 'prediction', label: 'Prediction Progress' },
		{ value: 'week', label: 'Distance This Week' },
		{ value: 'goal', label: 'Distance By Week' }
	];

	/** The picker's own list, narrowed to what the caller offered — see `views`. */
	const availableViews = $derived(ALL_GRAPH_VIEWS.filter((v) => views.includes(v.value)));

	// `views` decides the opening view once, at mount — it does not change for
	// either caller after that — so the read is untracked rather than left to
	// warn about a reactivity this is deliberately not asking for.
	let graphView = $state<GraphView>(untrack(() => views[0] ?? 'prediction'));

	// The arrows and the picker are the same control in two shapes: the picker
	// says where you are and jumps anywhere, the arrows step. Three graphs is a
	// short enough ring to wrap rather than dead-end, which also keeps the back
	// arrow live on the view the card opens on. With one view offered — the
	// shared page's case — there is nothing to step between, and the picker
	// below drops the arrows entirely rather than rendering ones that would
	// only wrap back to themselves.
	const graphIndex = $derived(availableViews.findIndex((v) => v.value === graphView));
	const previousGraph = $derived(
		availableViews[(graphIndex - 1 + availableViews.length) % availableViews.length]
	);
	const nextGraph = $derived(availableViews[(graphIndex + 1) % availableViews.length]);

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

	const raceDay = $derived(endDate);

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
		if (!raceDay || !startDate || isPast || !predicted || !goal.time_in_sec) return null;

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
			samples: splitHistory.forGoal.map((d) => ({ date: d.date, seconds: d.predictedTime })),
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
		if (raceForecast || isPast || historyError) return null;
		if (!userStats?.best_times?.time_for_goal || !goal.time_in_sec) {
			return 'No prediction to forecast from yet.';
		}
		if (readPlanWeeks(userStats?.graph_stats?.goal).weeks.length === 0) {
			return 'No plan weeks to forecast against yet.';
		}
		if (splitHistory.forGoal.length === 0) {
			return 'No prediction recorded yet for this goal — the forecast needs at least one earlier reading to price the plan against.';
		}
		if (raceDay && earnCutoff(raceDay) <= now) {
			return 'Race week: training from here changes how fresh you are, not how fast, so there is nothing left to forecast.';
		}
		return 'Not enough of this block on record yet to forecast — the earliest reading is too recent to tell whether you are keeping pace.';
	});

	// ── Prediction history & chart ─────────────────────────────────

	/**
	 * The goal's own distance, in whatever unit its pace is written in.
	 *
	 * `distance_value` is the goal saying so itself. The fallback divides the
	 * goal time by the goal pace, which is the same arithmetic the readings get
	 * and gives an answer for a goal that arrives without the field.
	 */
	const goalDistance = $derived(
		goal.distance_value > 0 ? goal.distance_value : impliedDistanceKm(goal.time, goal.pace)
	);

	/**
	 * The `history` prop, minus whatever was recorded for a different goal.
	 *
	 * Changing a goal does not change what is already stored, and the window
	 * callers fetch — everything since the goal's start date — catches the day
	 * of the change, whose reading was written before it. So a runner who swaps
	 * 15 km for a marathon in the morning opens this card to a 1:03 sitting
	 * under a 3:11 goal line, and every reader of the series takes it at face
	 * value: the chart draws a cliff, the badge calls it detraining, and the
	 * forecast prices the plan off a fall that never happened.
	 *
	 * Nothing in a row names its distance, but the row implies one — see
	 * `splitByGoalDistance` — and that is enough to leave the old goal's
	 * readings out of all four. They are still in the database, and the history
	 * page still plots them: converted to a fixed 10K, where they are
	 * comparable, which is exactly the thing they are not here.
	 */
	const splitHistory = $derived(splitByGoalDistance(history, goalDistance));

	/**
	 * What was left out, said plainly.
	 *
	 * A chart that quietly discards readings is a chart that disagrees with the
	 * database for reasons the runner cannot see — and the day after a goal
	 * change this one can be empty while the history behind it is not. The
	 * distance is what makes it make sense, so it is the thing the note leads
	 * with.
	 */
	const otherGoalNote = $derived.by(() => {
		const dropped = splitHistory.fromOtherGoals.length;
		if (dropped === 0) return null;

		const readings = dropped === 1 ? '1 earlier reading' : `${dropped} earlier readings`;
		const distances = splitHistory.otherDistances;
		const about =
			distances.length === 1
				? ` for a ${formatDistance(distances[0])} goal`
				: distances.length > 1
					? ' for other goal distances'
					: '';

		return `${readings}${about} in this window ${dropped === 1 ? 'is' : 'are'} not plotted — a prediction is a time over one distance, and this goal's is another.`;
	});

	/** `15 km` / `42.195 km` — a goal distance, without trailing zeroes. */
	function formatDistance(km: number): string {
		return `${Number(km.toFixed(3))} ${goal.distance_unit || 'km'}`;
	}

	// ── Which way the pace curve is going ──────────────────────────
	//
	// The card already draws the curve; what it never said is which way it is
	// pointing. That reading belongs in the heading rather than under the graph,
	// because it is true of the goal and not of whichever graph happens to be on
	// show — and because on a phone the heading is all there is when the card is
	// folded shut.

	const trend = $derived(paceTrend(splitHistory.forGoal, now));

	/**
	 * The arrow follows the curve, not the mood.
	 *
	 * Predicted pace falls as a runner gets faster, so improving is a downward
	 * arrow — the same movement they can see in the graph a few lines below.
	 * An upward arrow for improvement would contradict the chart it is
	 * describing. The word and the colour carry the good or bad news instead.
	 */
	const TREND_LOOK = {
		improving: { label: 'Improving', icon: TrendingDown, tone: 'text-primary' },
		maintaining: { label: 'Maintaining', icon: Minus, tone: 'text-muted-foreground' },
		detraining: { label: 'Detraining', icon: TrendingUp, tone: 'text-destructive' }
	} as const;

	/** The number behind the word, for the tooltip and for screen readers. */
	const trendNote = $derived.by(() => {
		if (!trend) return undefined;
		const span = `over the last ${trend.days} days`;
		if (trend.direction === 'maintaining') {
			return `Predicted pace is holding steady ${span}.`;
		}
		const rate = Math.abs(trend.perWeekSeconds).toFixed(1);
		const way = trend.direction === 'improving' ? 'faster' : 'slower';
		return `Predicted pace is ${rate}s/km ${way} per week ${span}.`;
	});

	// No fetch and no on-mount write happens here any more. `history` arrives
	// resolved, and the two writes that used to follow it — recording today's
	// prediction, archiving the current goal — moved to the server loads that
	// supply it (`keepHistory`, in `$lib/server/history/record.ts`), which is
	// also where §5 of `agents.md` says they belonged: no `onMount` for data a
	// `load` can already hold.
</script>

<div class="rounded-lg border border-border bg-card p-6 shadow-sm">
	<!--
		The head: what this card is, and — while it is closed on a phone — the one
		reading it exists to report. It stays put when the body folds away, so the
		control that opened the card is the control that closes it, and the card
		is seen to grow from its own heading rather than to be replaced.
	-->
	<div class="relative">
		{#if isPast}
			<div class="mb-4 flex items-center gap-3">
				<Trophy class="h-6 w-6 shrink-0 text-primary" />
				<h2 class="min-w-0 flex-1 text-xl font-semibold text-card-foreground">Goal Completed</h2>
				{@render headerExtra?.()}
				{@render foldIcon()}
			</div>
			<p class="text-muted-foreground">
				You completed <span class="font-medium text-card-foreground">{goal.name}</span>
				({goal.distance}) on {formattedEndDate}.
			</p>
		{:else}
			<div class="mb-4 flex items-center gap-3">
				<Target class="h-6 w-6 shrink-0 text-primary" />
				<h2 class="min-w-0 flex-1 truncate text-xl font-semibold text-card-foreground">
					{goal.name}
				</h2>
				{@render trendBadge()}
				{@render headerExtra?.()}
				{@render foldIcon()}
			</div>

			<!-- Guarded because the API no longer sends a description: an unguarded
			     paragraph was an empty block holding a margin open under the name. -->
			{#if goal.description}
				<p class="mb-4 text-sm text-muted-foreground">{goal.description}</p>
			{/if}

			<!--
				Event info. Wraps rather than overflowing, which is what a phone's
				width needs — and so it carries no pipe separators: a pipe that wraps
				to the end of a line dangles there pointing at nothing. The gap does
				the separating instead.
			-->
			<div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
				<Calendar class="h-4 w-4 shrink-0" />
				<span class="whitespace-nowrap">{formattedEndDate}</span>
				<span class="whitespace-nowrap">{goal.distance}</span>
				{#if weeksLeft !== null}
					<span class="whitespace-nowrap">{weeksLeft} weeks remaining</span>
				{/if}
			</div>
		{/if}

		<!--
			The whole head is the control, laid over it rather than wrapped around
			it: a heading may not live inside a button, and a chevron alone is a
			40px target on a card the thumb is already resting on. The icon above
			carries the state, so this only has to carry the semantics.
		-->
		{#if collapsible}
			<button
				type="button"
				onclick={ontoggle}
				aria-expanded={expanded}
				aria-controls={bodyId}
				class="absolute -inset-2 rounded-md focus:outline-none focus:ring-2 focus:ring-ring lg:hidden"
			>
				<span class="sr-only">{expanded ? 'Hide' : 'Show'} goal details</span>
			</button>
		{/if}
	</div>

	<!-- The closed card's own reading, which the body's table says at length. -->
	<div class={headClass}>
		<div class="overflow-hidden">
			<div class="pt-4">
				<PredictionStats time={userStats?.best_times?.time_for_goal || null} pace={predictedPace} />
			</div>
		</div>
	</div>

	<div id={bodyId} class={bodyClass}>
		<div class={clip}>
			<div class="pt-6">
				{#if isPast}
					<!-- Historical chart for completed goals -->
					{@render graphPicker()}
					{@render graph()}
				{:else}
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
											<td class="px-4 py-2 font-medium text-card-foreground"
												>Projected on race day</td
											>
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

					<!-- Progress bar. Drawn only when the goal's own dates say how long
					     it runs for — a bar with nothing behind it states a position
					     in a plan, which is the one thing it must not invent. -->
					{#if progress !== null && totalDays !== null && daysPassed !== null}
						<div class="mb-6">
							<div class="flex items-center justify-between mb-1.5">
								<span class="text-xs font-medium text-muted-foreground">Training Progress</span>
								<span class="text-xs font-medium text-muted-foreground">
									{Math.round(progress)}%
								</span>
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
					{/if}

					<!-- Prediction / distance chart -->
					<div>
						{@render graphPicker()}
						{@render graph()}
					</div>
				{/if}
			</div>
		</div>
	</div>
</div>

<!--
	The one thing the heading could say that the card never did: which way the
	pace curve under it is pointing. It sits beside the goal's name because it
	is a reading of the goal rather than of a graph, and because a folded card
	on a phone is nothing but this row.

	No loading branch: `history` arrives resolved, so the trend is known from
	the first render and there is nothing here to wait for.
-->
{#snippet trendBadge()}
	{#if trend}
		{@const look = TREND_LOOK[trend.direction]}
		<span
			class="flex shrink-0 items-center gap-1 text-xs font-medium whitespace-nowrap {look.tone}"
			title={trendNote}
		>
			<look.icon class="h-3.5 w-3.5" aria-hidden="true" />
			{look.label}
			<span class="sr-only">. {trendNote}</span>
		</span>
	{/if}
{/snippet}

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
{#snippet foldIcon()}
	{#if collapsible}
		<ChevronDown
			class="h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200 lg:hidden {expanded
				? 'rotate-180'
				: ''}"
			aria-hidden="true"
		/>
	{/if}
{/snippet}

{#snippet graphPicker()}
	{#if availableViews.length <= 1}
		<!--
			One view offered — the shared page's case — so there is nowhere to
			pick or step to. The title still says what the graph below is, just
			as a static heading rather than as a control that would only ever do
			nothing.
		-->
		<div class="mb-2 text-sm font-medium text-muted-foreground">
			{availableViews[0]?.label ?? ALL_GRAPH_VIEWS.find((v) => v.value === graphView)?.label}
		</div>
	{:else}
		<div class="mb-2 flex items-center justify-between gap-2">
			<label>
				<span class="sr-only">Which graph to show</span>
				<select
					bind:value={graphView}
					class="-ml-1 cursor-pointer rounded-md border-0 bg-transparent py-0.5 pl-1 pr-6 text-sm font-medium text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
				>
					{#each availableViews as view (view.value)}
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
	{/if}
{/snippet}

{#snippet graph()}
	{#if graphView === 'week'}
		<DistanceChart series={weekSeries} emptyMessage="No distance planned for this week" />
	{:else if graphView === 'goal'}
		<DistanceChart series={goalSeries} emptyMessage="No weekly distances for this goal yet" />
	{:else}
		<PredictionChart
			data={splitHistory.forGoal}
			loading={false}
			error={historyError}
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
			{#if otherGoalNote}
				<p class="mt-1 text-xs leading-relaxed text-muted-foreground">{otherGoalNote}</p>
			{/if}
		{/if}
	</div>
{/snippet}
