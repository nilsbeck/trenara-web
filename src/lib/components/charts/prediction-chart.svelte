<script lang="ts">
	import { Loader2, TrendingDown } from 'lucide-svelte';
	import { secondsToTimeString, secondsToPaceString, formatDateShort } from '$lib/utils/format';
	import { paceRatio, summarise, formatDelta } from '$lib/utils/prediction-graph';

	export interface ChartDataPoint {
		date: string;
		predictedTime: number;
		predictedPace: number;
		formattedTime: string;
		formattedPace: string;
	}

	let {
		data = [],
		loading = false,
		error = null,
		timeLabel = 'Predicted Time',
		paceLabel = 'Predicted Pace'
	}: {
		data: ChartDataPoint[];
		loading?: boolean;
		error?: string | null;
		/** Axis captions — the series differs per chart (goal distance vs. 10K). */
		timeLabel?: string;
		paceLabel?: string;
	} = $props();

	// Shared with the distance charts this sits beside in the picker, so the
	// card keeps its height when the view changes.
	const HEIGHT = 196;
	const PAD = { top: 14, right: 46, bottom: 44, left: 54 };

	let containerWidth = $state(500);

	const cw = $derived(Math.max(0, containerWidth - PAD.left - PAD.right));
	const ch = HEIGHT - PAD.top - PAD.bottom;

	/**
	 * One scale, in seconds of predicted time.
	 *
	 * Pace is not a second series: for a fixed distance it is the same number
	 * divided by that distance, so the old two-line, two-axis chart was drawing
	 * one trend twice and inviting the reader to compare it with itself. It is
	 * a second *labelling* of this axis now — see `ratio` below.
	 */
	const extent = $derived.by(() => {
		if (data.length === 0) return { min: 0, max: 1 };
		const vals = data.map((d) => d.predictedTime);
		const min = Math.min(...vals);
		const max = Math.max(...vals);
		// Predictions move by fractions of a percent, so a zero baseline would
		// flatten the trend to a straight line. The window is the data plus a
		// margin, and the axis says as much by never showing a zero.
		const pad = (max - min) * 0.18 || 60;
		return { min: min - pad, max: max + pad };
	});

	/** Null when the series spans distances, which is when pace stops converting. */
	const ratio = $derived(paceRatio(data));

	const summary = $derived(summarise(data));

	function xPos(i: number): number {
		if (data.length <= 1) return cw / 2;
		return (i / (data.length - 1)) * cw;
	}

	function yPos(v: number): number {
		const range = extent.max - extent.min;
		if (range === 0) return ch / 2;
		return ch - ((v - extent.min) / range) * ch;
	}

	const linePath = $derived(
		data.map((d, i) => `${i === 0 ? 'M' : 'L'}${xPos(i)},${yPos(d.predictedTime)}`).join(' ')
	);

	const areaPath = $derived.by(() => {
		if (data.length === 0) return '';
		const last = data.length - 1;
		return `${linePath} L${xPos(last)},${ch} L${xPos(0)},${ch} Z`;
	});

	/**
	 * The fastest and slowest predictions in view, plus the latest.
	 *
	 * Three labels rather than an even ladder, matching the distance charts: on
	 * a series this tightly bunched the numbers worth reading off the axis are
	 * the best, the worst, and where it stands now.
	 */
	const yTicks = $derived.by(() => {
		if (data.length === 0) return [];
		const vals = data.map((d) => d.predictedTime);
		const best = Math.min(...vals);
		const worst = Math.max(...vals);
		const latest = vals[vals.length - 1];
		const ticks = [worst, best];
		const span = worst - best;
		// Only if it would not sit on top of one of the other two.
		if (
			span > 0 &&
			Math.abs(latest - best) / span > 0.12 &&
			Math.abs(worst - latest) / span > 0.12
		) {
			ticks.push(latest);
		}
		return [...new Set(ticks)];
	});

	const xLabels = $derived.by(() => {
		if (data.length === 0) return [];
		const minSpacing = 56;
		const step = Math.max(1, Math.ceil(data.length / Math.max(1, Math.floor(cw / minSpacing))));
		const shown = data
			.map((d, i) => ({ i, label: formatDateShort(d.date) }))
			.filter(({ i }) => i % step === 0);
		const last = data.length - 1;
		if (shown[shown.length - 1]?.i !== last) {
			shown.push({ i: last, label: formatDateShort(data[last].date) });
		}
		return shown;
	});

	// ── Hover ──────────────────────────────────────────────────────
	let hoverIdx = $state<number | null>(null);

	function handleMove(e: MouseEvent) {
		if (data.length === 0) return;
		const svg = (e.currentTarget as SVGElement).closest('svg');
		if (!svg) return;
		const mx = e.clientX - svg.getBoundingClientRect().left - PAD.left;
		if (data.length === 1) {
			hoverIdx = 0;
			return;
		}
		const seg = cw / (data.length - 1);
		hoverIdx = Math.max(0, Math.min(data.length - 1, Math.round(mx / seg)));
	}

	const LINE = '#a855f7';
	const TOOLTIP_W = 150;
	const TOOLTIP_H = 58;
</script>

<div class="w-full" bind:clientWidth={containerWidth}>
	{#if loading}
		<div class="flex items-center justify-center py-12">
			<Loader2 class="h-5 w-5 animate-spin text-muted-foreground" />
			<span class="ml-2 text-sm text-muted-foreground">Loading chart data...</span>
		</div>
	{:else if error}
		<div class="flex flex-col items-center justify-center py-12">
			<p class="text-sm font-medium text-destructive">Chart Error</p>
			<p class="mt-1 text-xs text-muted-foreground">{error}</p>
		</div>
	{:else if data.length === 0}
		<div class="flex flex-col items-center justify-center py-12 text-center">
			<TrendingDown class="mb-3 h-9 w-9 text-muted-foreground/40" />
			<p class="text-sm font-medium text-muted-foreground">No prediction data yet</p>
			<p class="mt-1 text-xs text-muted-foreground">
				Complete training sessions to start tracking your prediction trends
			</p>
		</div>
	{:else}
		<!--
			One series, so no legend box: the axis captions name both readings of
			the line, which a legend of one entry could not do.
		-->
		<div class="mb-0.5 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-xs">
			<span class="flex items-center gap-2">
				<span class="inline-block h-2.5 w-2.5 rounded-full" style="background:{LINE}"></span>
				<span class="text-muted-foreground">{timeLabel}</span>
			</span>
			{#if ratio !== null}
				<span class="text-muted-foreground">· {paceLabel} on the right</span>
			{/if}
		</div>

		<svg
			width={containerWidth}
			height={HEIGHT}
			class="select-none"
			role="img"
			aria-label="{timeLabel} over time"
		>
			<defs>
				<linearGradient id="prediction-fill" x1="0" y1="0" x2="0" y2="1">
					<stop offset="0%" stop-color={LINE} stop-opacity="0.28" />
					<stop offset="100%" stop-color={LINE} stop-opacity="0.02" />
				</linearGradient>
			</defs>

			<g transform="translate({PAD.left},{PAD.top})">
				<line x1={0} y1={0} x2={0} y2={ch} stroke="currentColor" class="text-border" />
				<line x1={0} y1={ch} x2={cw} y2={ch} stroke="currentColor" class="text-border" />

				<!-- Time on the left, and the very same gridline read as a pace on
				     the right. Two units, one scale — never two scales. -->
				{#each yTicks as tick}
					{@const y = yPos(tick)}
					<text
						x={-8}
						{y}
						text-anchor="end"
						dominant-baseline="middle"
						class="fill-current text-muted-foreground"
						style="font-size:10px"
					>
						{secondsToTimeString(tick)}
					</text>
					{#if ratio !== null}
						<text
							x={cw + 8}
							{y}
							text-anchor="start"
							dominant-baseline="middle"
							class="fill-current text-muted-foreground"
							style="font-size:10px"
						>
							{secondsToPaceString(tick * ratio)}
						</text>
					{/if}
				{/each}

				<path d={areaPath} fill="url(#prediction-fill)" stroke="none" />

				{#if data.length > 1}
					<path
						d={linePath}
						fill="none"
						stroke={LINE}
						stroke-width="2"
						stroke-linejoin="round"
						stroke-linecap="round"
					/>
				{/if}

				{#each data as d, i}
					{@const isLatest = i === data.length - 1}
					<circle
						cx={xPos(i)}
						cy={yPos(d.predictedTime)}
						r={hoverIdx === i || isLatest ? 5 : 3.5}
						fill={LINE}
						class="stroke-card"
						stroke-width="2"
					/>
				{/each}

				{#each xLabels as { i, label }}
					{@const isLatest = i === data.length - 1}
					<text
						x={xPos(i)}
						y={ch + 17}
						text-anchor="middle"
						class="fill-current"
						class:text-foreground={isLatest}
						class:text-muted-foreground={!isLatest}
						style="font-size:11px;font-weight:{isLatest ? 600 : 400}"
					>
						{label}
					</text>
				{/each}

				<text
					x={cw / 2}
					y={ch + 34}
					text-anchor="middle"
					class="fill-current text-muted-foreground"
					style="font-size:11px"
				>
					Date recorded
				</text>

				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<rect
					x={0}
					y={0}
					width={cw}
					height={ch}
					fill="transparent"
					onmousemove={handleMove}
					onmouseleave={() => (hoverIdx = null)}
				/>

				{#if hoverIdx !== null && data[hoverIdx]}
					{@const d = data[hoverIdx]}
					{@const hx = xPos(hoverIdx)}
					{@const tx = Math.max(0, Math.min(cw - TOOLTIP_W, hx - TOOLTIP_W / 2))}
					<line
						x1={hx}
						y1={0}
						x2={hx}
						y2={ch}
						stroke="currentColor"
						class="text-muted-foreground"
						stroke-dasharray="2,2"
						opacity="0.5"
					/>
					<rect
						x={tx}
						y={4}
						width={TOOLTIP_W}
						height={TOOLTIP_H}
						rx="6"
						class="fill-popover stroke-border"
						stroke-width="1"
					/>
					<text
						x={tx + 10}
						y={21}
						class="fill-current text-popover-foreground"
						style="font-size:11px;font-weight:600"
					>
						{formatDateShort(d.date)}
					</text>
					<text
						x={tx + 10}
						y={38}
						class="fill-current text-muted-foreground"
						style="font-size:11px"
					>
						Time {d.formattedTime}
					</text>
					<text
						x={tx + 10}
						y={53}
						class="fill-current text-muted-foreground"
						style="font-size:11px"
					>
						Pace {d.formattedPace}
					</text>
				{/if}
			</g>
		</svg>

		<!--
			Where the prediction stands, and how far it has come — the read-out the
			distance charts carry, answering the question this card exists for.
		-->
		{#if summary}
			<div class="mt-0.5 flex flex-wrap items-baseline justify-between gap-x-3 text-xs">
				<span class="font-semibold text-foreground">{summary.latest.formattedTime}</span>
				{#if summary.hasTrend && Math.round(summary.gainedSeconds) !== 0}
					<!-- No sign glyph: "faster" and "slower" already carry the
					     direction, and "−8:05 faster" reads as a contradiction. -->
					<span class:text-foreground={summary.gainedSeconds > 0} class="text-muted-foreground">
						{formatDelta(summary.gainedSeconds)}
						{summary.gainedSeconds > 0 ? 'faster' : 'slower'} since {formatDateShort(data[0].date)}
					</span>
				{:else}
					<span class="text-muted-foreground">{summary.latest.formattedPace}</span>
				{/if}
			</div>
		{/if}
	{/if}
</div>
