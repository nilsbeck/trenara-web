<script lang="ts">
	import { Loader2, TrendingDown } from 'lucide-svelte';
	import { secondsToTimeString, secondsToPaceString, formatDateShort } from '$lib/utils/format';
	import { paceRatio, summarise, formatDelta } from '$lib/utils/prediction-graph';

	export interface ProjectionSeries {
		label: string;
		colour: string;
		/** Dates with a predicted time in seconds, in order. */
		points: { date: string; seconds: number }[];
	}

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
		paceLabel = 'Predicted Pace',
		domainEnd = null,
		projections = [],
		reference = null
	}: {
		data: ChartDataPoint[];
		loading?: boolean;
		error?: string | null;
		/** Axis captions — the series differs per chart (goal distance vs. 10K). */
		timeLabel?: string;
		paceLabel?: string;
		/**
		 * Push the x axis out to this date, past the last reading.
		 *
		 * For anything that has to be drawn beyond the recorded history — a race
		 * date, a forecast — so the extension lives in the caller rather than
		 * here.
		 */
		domainEnd?: Date | null;
		/**
		 * Lines drawn past the recorded history, dashed, and named in the caption
		 * beside the series they extend.
		 *
		 * Time series only: with pace a second labelling of the same axis, a
		 * projected pace would be the same claim twice.
		 */
		projections?: ProjectionSeries[];
		/** A horizontal line to read the series against — the goal's own time. */
		reference?: { seconds: number; label: string } | null;
	} = $props();

	// Shared with the distance charts this sits beside in the picker, so the
	// card keeps its height when the view changes.
	const HEIGHT = 196;
	const DAY_MS = 86_400_000;
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
		// Everything drawn, or a forecast leaves the frame without saying so.
		const vals = [
			...data.map((d) => d.predictedTime),
			...projections.flatMap((p) => p.points.map((pt) => pt.seconds)),
			...(reference ? [reference.seconds] : [])
		];
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

	/**
	 * x is a time scale, not a sample index.
	 *
	 * Readings are only recorded when the prediction changes, so by index three
	 * days and five weeks are the same gap — which draws a straight line through
	 * a quiet month and, more to the point, leaves no position at all for a date
	 * past the last reading. Race day has to be placeable for the forecast to
	 * reach it.
	 */
	const stamps = $derived(data.map((d) => new Date(d.date).getTime()));

	const xDomain = $derived.by(() => {
		if (stamps.length === 0) return { min: 0, max: 1 };
		const min = Math.min(...stamps);
		const last = Math.max(...stamps);
		const max = Math.max(last, domainEnd?.getTime() ?? -Infinity);
		// One reading, or several on the same day: give the axis a day of width
		// so the point lands mid-chart rather than dividing by zero.
		return max > min ? { min, max } : { min: min - DAY_MS / 2, max: min + DAY_MS / 2 };
	});

	function xAt(stamp: number): number {
		const { min, max } = xDomain;
		return ((stamp - min) / (max - min)) * cw;
	}

	function xPos(i: number): number {
		return xAt(stamps[i] ?? xDomain.min);
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

	const MIN_LABEL_SPACING = 56;

	/**
	 * Date labels, chosen by how far apart they land rather than by how many
	 * readings sit between them.
	 *
	 * On a time axis an every-nth-reading rule bunches labels wherever the
	 * recording bunched. Walking back from the most recent instead keeps the
	 * latest reading labelled — the one the read-out below is about — and lets
	 * the rest fall in behind it at a spacing that stays legible.
	 */
	const xLabels = $derived.by(() => {
		if (data.length === 0) return [];
		const picked: { x: number; label: string; isLatest: boolean }[] = [];
		const endX = domainEnd ? xAt(domainEnd.getTime()) : null;

		for (let i = data.length - 1; i >= 0; i--) {
			const x = xPos(i);
			// Race day owns its end of the axis: a reading crowded against it
			// loses its label rather than printing over the date the chart is
			// counting down to.
			if (endX !== null && endX - x < MIN_LABEL_SPACING) continue;
			if (picked.length > 0 && picked[picked.length - 1].x - x < MIN_LABEL_SPACING) continue;
			picked.push({ x, label: formatDateShort(data[i].date), isLatest: i === data.length - 1 });
		}

		return picked.reverse();
	});

	/** Race day's own label, when the axis has been pushed out to it. */
	const endLabel = $derived(
		domainEnd
			? { x: xAt(domainEnd.getTime()), label: formatDateShort(domainEnd.toISOString()) }
			: null
	);

	function projectionPath(series: ProjectionSeries): string {
		return series.points
			.map((p, i) => `${i === 0 ? 'M' : 'L'}${xAt(new Date(p.date).getTime())},${yPos(p.seconds)}`)
			.join(' ');
	}

	// ── Hover ──────────────────────────────────────────────────────
	let hoverIdx = $state<number | null>(null);

	function handleMove(e: MouseEvent) {
		if (data.length === 0) return;
		const svg = (e.currentTarget as SVGElement).closest('svg');
		if (!svg) return;
		const rect = svg.getBoundingClientRect();
		// The viewBox can lag the rendered width by a frame after a resize, so
		// convert the pointer into viewBox units rather than assuming 1:1.
		const scale = rect.width > 0 ? Math.max(1, containerWidth) / rect.width : 1;
		const mx = (e.clientX - rect.left) * scale - PAD.left;

		// Nearest reading by position. With a time axis the readings are no
		// longer evenly spaced, so there is no segment width to divide by.
		let nearest = 0;
		let best = Infinity;
		for (let i = 0; i < data.length; i++) {
			const distance = Math.abs(xPos(i) - mx);
			if (distance < best) {
				best = distance;
				nearest = i;
			}
		}
		hoverIdx = nearest;
	}

	const LINE = '#a855f7';
	const TOOLTIP_W = 150;
	const TOOLTIP_H = 58;
</script>

<div class="w-full min-w-0" bind:clientWidth={containerWidth}>
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
			<!-- A dashed swatch, so the caption says which line is arithmetic. -->
			{#each projections as series (series.label)}
				<span class="flex items-center gap-2">
					<svg width="14" height="2" aria-hidden="true" class="shrink-0">
						<line
							x1="0"
							y1="1"
							x2="14"
							y2="1"
							stroke={series.colour}
							stroke-width="2"
							stroke-dasharray="4,3"
						/>
					</svg>
					<span class="text-muted-foreground">{series.label}</span>
				</span>
			{/each}
		</div>

		<!--
			The plot is absolutely positioned inside a box of fixed height, so it
			contributes nothing to the card's content width.

			It has to be nothing, not merely "100%": a card sized to its content
			grows to fit whatever intrinsic width the chart claims, and the chart
			then measures that new width and claims it again. Both a pixel `width`
			and a `viewBox` supply such an intrinsic width, which is why setting
			`width="100%"` alone did not stop the card widening on every switch.
			Out of flow, the chart can only ever fit the card.
		-->
		<div class="relative w-full" style="height:{HEIGHT}px">
			<svg
				viewBox="0 0 {Math.max(1, containerWidth)} {HEIGHT}"
				preserveAspectRatio="xMidYMid meet"
				class="absolute inset-0 h-full w-full select-none"
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

					<!-- The goal itself, to read the series against. -->
					{#if reference}
						{@const ry = yPos(reference.seconds)}
						<line
							x1={0}
							y1={ry}
							x2={cw}
							y2={ry}
							stroke="currentColor"
							class="text-muted-foreground"
							stroke-dasharray="6,4"
							opacity="0.7"
						/>
						<!--
							Below the line, where the goal is the floor and the space under
							it is empty. Above it is where the prediction lives and where a
							forecast closing on the goal arrives, which is how this label
							came to be printed over the line it was describing. Flipped back
							above only when the goal sits too low for the text to fit.
						-->
						<text
							x={cw}
							y={ry + 11 > ch ? ry - 4 : ry + 11}
							text-anchor="end"
							class="fill-current text-muted-foreground"
							style="font-size:9px"
						>
							{reference.label}
						</text>
					{/if}

					<path d={areaPath} fill="url(#prediction-fill)" stroke="none" />

					<!--
						Forecasts, under the recorded line so they never obscure it, and
						never filled: the area under the measured series says "this
						happened", and there is nothing under a projection to shade.
					-->
					{#each projections as series (series.label)}
						<path
							d={projectionPath(series)}
							fill="none"
							stroke={series.colour}
							stroke-width="2"
							stroke-dasharray="5,4"
							stroke-linecap="round"
							opacity="0.9"
						/>
					{/each}

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

					{#each xLabels as { x, label, isLatest } (label)}
						<text
							{x}
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

					{#if endLabel}
						<text
							x={endLabel.x}
							y={ch + 17}
							text-anchor="middle"
							class="fill-current text-muted-foreground"
							style="font-size:11px"
						>
							{endLabel.label}
						</text>
					{/if}

					<text
						x={cw / 2}
						y={ch + 34}
						text-anchor="middle"
						class="fill-current text-muted-foreground"
						style="font-size:11px"
					>
						{domainEnd ? 'Date' : 'Date recorded'}
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
		</div>

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
