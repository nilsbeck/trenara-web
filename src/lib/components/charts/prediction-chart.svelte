<script lang="ts">
	import { Loader2, TrendingDown } from 'lucide-svelte';
	import { secondsToTimeString, secondsToPaceString, formatDateShort } from '$lib/utils/format';

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
		reference = null,
		distanceKm = null
	}: {
		data: ChartDataPoint[];
		loading?: boolean;
		error?: string | null;
		/** Legend labels — the series differs per chart (goal distance vs. 10K). */
		timeLabel?: string;
		paceLabel?: string;
		/**
		 * Push the x axis out to this date, past the last sample.
		 *
		 * For anything that has to be drawn beyond the recorded history — a race
		 * date, a projection — so the extension lives in the caller rather than
		 * here.
		 */
		domainEnd?: Date | null;
		/**
		 * Lines drawn past the recorded history, dashed and named on the line
		 * itself rather than in the legend — the legend describes what the chart
		 * measures, and a projection is not a measurement.
		 *
		 * Time series only: a projected pace would be the same claim twice, and
		 * the second one is not worth the ink.
		 */
		projections?: ProjectionSeries[];
		/** A horizontal line to read the series against — the goal's own time. */
		reference?: { seconds: number; label: string } | null;
		/**
		 * The distance the series is about, which ties the two axes together.
		 *
		 * Time and pace are one number over a fixed distance, so with this set the
		 * right axis is computed from the left and only one line is drawn. Both
		 * readings stay — the axis a runner actually reads is the pace one — but
		 * the chart stops plotting the same quantity twice.
		 *
		 * Null keeps the old behaviour: two independently scaled series.
		 */
		distanceKm?: number | null;
	} = $props();

	// Layout constants
	const DAY_MS = 86_400_000;
	const HEIGHT = 300;
	const PAD = { top: 24, right: 64, bottom: 44, left: 64 };

	// Responsive container width
	let containerWidth = $state(500);

	const cw = $derived(Math.max(0, containerWidth - PAD.left - PAD.right));
	const ch = HEIGHT - PAD.top - PAD.bottom;

	// ── Scale extents ──────────────────────────────────────────────
	const timeExtent = $derived.by(() => {
		if (data.length === 0) return { min: 0, max: 1 };
		// Everything drawn, or a projection leaves the frame without saying so.
		const vals = [
			...data.map((d) => d.predictedTime),
			...projections.flatMap((p) => p.points.map((pt) => pt.seconds)),
			...(reference ? [reference.seconds] : [])
		];
		const min = Math.min(...vals);
		const max = Math.max(...vals);
		const pad = (max - min) * 0.12 || 60;
		return { min: min - pad, max: max + pad };
	});

	/**
	 * True when the pace axis is derived from the time one.
	 *
	 * Both series are still drawn — pace is what a runner executes and wants to
	 * see. What coupling fixes is the two axes disagreeing: the goal reference
	 * and any projection stretch the time extent, and a pace axis left to scale
	 * itself against the data alone then magnifies the same movement several
	 * times harder, so the two lines wander apart as though they were saying
	 * different things.
	 */
	const coupled = $derived(distanceKm !== null && distanceKm > 0);

	const paceExtent = $derived.by(() => {
		if (data.length === 0) return { min: 0, max: 1 };
		// Derived from the time axis rather than from the recorded pace: the
		// stored pace is rounded to the whole second, which is fifteen seconds on
		// a 15 km goal, and on an axis this tight that rounding was drawing
		// zigzags nobody ran.
		if (coupled) {
			return { min: timeExtent.min / distanceKm!, max: timeExtent.max / distanceKm! };
		}
		const vals = data.map((d) => d.predictedPace);
		const min = Math.min(...vals);
		const max = Math.max(...vals);
		const pad = (max - min) * 0.12 || 10;
		return { min: min - pad, max: max + pad };
	});

	// ── Scale functions ────────────────────────────────────────────
	//
	// x is a time scale, not a sample index. Samples are only recorded when a
	// value changes, so three days and five weeks are the same gap by index —
	// which draws a straight line through a month of nothing and makes any date
	// past the last sample unplaceable.
	const stamps = $derived(data.map((d) => new Date(d.date).getTime()));

	const xDomain = $derived.by(() => {
		if (stamps.length === 0) return { min: 0, max: 1 };
		const min = Math.min(...stamps);
		const last = Math.max(...stamps);
		const max = Math.max(last, domainEnd?.getTime() ?? -Infinity);
		// One point, or several on the same day: give the axis a day of width so
		// the sample lands mid-chart rather than dividing by zero.
		return max > min ? { min, max } : { min: min - DAY_MS / 2, max: min + DAY_MS / 2 };
	});

	function xAt(stamp: number): number {
		const { min, max } = xDomain;
		return ((stamp - min) / (max - min)) * cw;
	}

	function xPos(i: number): number {
		return xAt(stamps[i] ?? xDomain.min);
	}

	function timeY(v: number): number {
		const range = timeExtent.max - timeExtent.min;
		if (range === 0) return ch / 2;
		return ch - ((v - timeExtent.min) / range) * ch;
	}

	function paceY(v: number): number {
		const range = paceExtent.max - paceExtent.min;
		if (range === 0) return ch / 2;
		return ch - ((v - paceExtent.min) / range) * ch;
	}

	// ── SVG line paths ─────────────────────────────────────────────
	const timePath = $derived(
		data.map((d, i) => `${i === 0 ? 'M' : 'L'}${xPos(i)},${timeY(d.predictedTime)}`).join(' ')
	);

	const pacePath = $derived(
		data.map((d, i) => `${i === 0 ? 'M' : 'L'}${xPos(i)},${paceY(d.predictedPace)}`).join(' ')
	);

	// ── Axis tick helpers ──────────────────────────────────────────
	function ticks(min: number, max: number, n = 5): number[] {
		const step = (max - min) / (n - 1);
		return Array.from({ length: n }, (_, i) => min + step * i);
	}

	const timeTicks = $derived(ticks(timeExtent.min, timeExtent.max, 5));
	const paceTicks = $derived(ticks(paceExtent.min, paceExtent.max, 5));

	/**
	 * Evenly spaced dates across the axis, not every nth sample.
	 *
	 * A sample-derived label bunches up wherever the recording did, which is
	 * exactly where the axis is now least evenly spaced.
	 */
	const xLabels = $derived.by(() => {
		if (data.length === 0) return [];
		const { min, max } = xDomain;
		const count = 5;
		const labels: { x: number; label: string }[] = [];
		for (let i = 0; i < count; i++) {
			const stamp = min + ((max - min) * i) / (count - 1);
			labels.push({ x: xAt(stamp), label: formatDateShort(new Date(stamp).toISOString()) });
		}
		return labels;
	});

	// ── Hover / Tooltip ────────────────────────────────────────────
	let hoverIdx = $state<number | null>(null);

	function handleMouseMove(e: MouseEvent) {
		if (data.length === 0) return;
		const svg = (e.currentTarget as SVGElement).closest('svg');
		if (!svg) return;
		const rect = svg.getBoundingClientRect();
		const mx = e.clientX - rect.left - PAD.left;

		// Nearest sample by position: with a time axis the samples are no longer
		// evenly spaced, so there is no segment width to divide by.
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

	function handleMouseLeave() {
		hoverIdx = null;
	}

	const BLUE = '#2563eb';
	const RED = '#dc2626';

	function projectionPath(series: ProjectionSeries): string {
		return series.points
			.map((p, i) => `${i === 0 ? 'M' : 'L'}${xAt(new Date(p.date).getTime())},${timeY(p.seconds)}`)
			.join(' ');
	}

	/**
	 * Where each projection's label sits: at its far end, clear of the line and
	 * of the label before it.
	 *
	 * Two projections that end close together would otherwise print on top of
	 * each other, which is how a label meant to remove doubt creates it.
	 */
	const labelPositions = $derived.by(() => {
		const placed: { x: number; y: number }[] = [];

		for (const series of projections) {
			const last = series.points[series.points.length - 1];
			const x = xAt(new Date(last.date).getTime());
			let y = timeY(last.seconds) - 6;

			// Push down past anything already sitting at this height.
			for (const other of placed) {
				if (Math.abs(other.y - y) < 12) y = other.y + 12;
			}

			placed.push({ x, y });
		}

		return placed;
	});
</script>

<div class="w-full" bind:clientWidth={containerWidth}>
	{#if loading}
		<div class="flex items-center justify-center py-16">
			<Loader2 class="h-5 w-5 animate-spin text-muted-foreground" />
			<span class="ml-2 text-sm text-muted-foreground">Loading chart data...</span>
		</div>
	{:else if error}
		<div class="flex flex-col items-center justify-center py-16">
			<p class="text-sm font-medium text-destructive">Chart Error</p>
			<p class="mt-1 text-xs text-muted-foreground">{error}</p>
		</div>
	{:else if data.length === 0}
		<div class="flex flex-col items-center justify-center py-16 text-center">
			<TrendingDown class="mb-3 h-10 w-10 text-muted-foreground/40" />
			<p class="text-sm font-medium text-muted-foreground">No prediction data yet</p>
			<p class="mt-1 text-xs text-muted-foreground">
				Complete training sessions to start tracking your prediction trends
			</p>
		</div>
	{:else}
		<!-- Legend -->
		<div class="mb-2 flex items-center justify-center gap-6 text-xs">
			<span class="flex items-center gap-1.5">
				<span class="inline-block h-0.5 w-4 rounded" style="background:{BLUE}"></span>
				<span class="text-muted-foreground">{timeLabel}</span>
			</span>
			<span class="flex items-center gap-1.5">
				<span class="inline-block h-0.5 w-4 rounded" style="background:{RED}"></span>
				<span class="text-muted-foreground">{paceLabel}</span>
			</span>
		</div>

		<!-- SVG Chart -->
		<svg
			width={containerWidth}
			height={HEIGHT}
			class="select-none"
			role="img"
			aria-label="Prediction progress chart"
		>
			<g transform="translate({PAD.left},{PAD.top})">
				<!-- Grid lines (horizontal) -->
				{#each timeTicks as tick}
					{@const y = timeY(tick)}
					<line
						x1={0}
						y1={y}
						x2={cw}
						y2={y}
						stroke="currentColor"
						class="text-border"
						stroke-dasharray="3,3"
					/>
				{/each}

				<!-- X axis -->
				<line x1={0} y1={ch} x2={cw} y2={ch} stroke="currentColor" class="text-border" />

				<!-- Y-left axis (time) -->
				<line x1={0} y1={0} x2={0} y2={ch} stroke={BLUE} opacity="0.3" />
				{#each timeTicks as tick}
					{@const y = timeY(tick)}
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
				{/each}
				<text x={-8} y={-12} text-anchor="end" style="font-size:9px;fill:{BLUE}"> Time </text>

				<!-- Y-right axis (pace) -->
				<line x1={cw} y1={0} x2={cw} y2={ch} stroke={RED} opacity="0.3" />
				{#each paceTicks as tick}
					{@const y = paceY(tick)}
					<text
						x={cw + 8}
						{y}
						text-anchor="start"
						dominant-baseline="middle"
						class="fill-current text-muted-foreground"
						style="font-size:10px"
					>
						{secondsToPaceString(tick)}
					</text>
				{/each}
				<text x={cw + 8} y={-12} text-anchor="start" style="font-size:9px;fill:{RED}"> Pace </text>

				<!-- X labels -->
				{#each xLabels as { x, label }}
					<text
						{x}
						y={ch + 20}
						text-anchor="middle"
						class="fill-current text-muted-foreground"
						style="font-size:10px"
					>
						{label}
					</text>
				{/each}

				<!-- The goal itself, to read the series against -->
				{#if reference}
					{@const ry = timeY(reference.seconds)}
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
					<text
						x={cw}
						y={ry - 5}
						text-anchor="end"
						class="fill-current text-muted-foreground"
						style="font-size:9px"
					>
						{reference.label}
					</text>
				{/if}

				<!--
					Projections, under the recorded line so they never obscure it, and
					named on the line: dashes say "different", they do not say "this
					one is our arithmetic rather than a figure anybody measured".
				-->
				{#each projections as series, i (series.label)}
					{@const end = labelPositions[i]}
					<path
						d={projectionPath(series)}
						fill="none"
						stroke={series.colour}
						stroke-width="2"
						stroke-dasharray="5,4"
						stroke-linecap="round"
						opacity="0.9"
					/>
					<text x={end.x} y={end.y} text-anchor="end" style="font-size:9px;fill:{series.colour}">
						{series.label}
					</text>
				{/each}

				<!-- Time line -->
				{#if data.length > 1}
					<path
						d={timePath}
						fill="none"
						stroke={BLUE}
						stroke-width="2.5"
						stroke-linejoin="round"
						stroke-linecap="round"
					/>
				{/if}

				<!-- Pace line -->
				{#if data.length > 1}
					<path
						d={pacePath}
						fill="none"
						stroke={RED}
						stroke-width="2.5"
						stroke-linejoin="round"
						stroke-linecap="round"
					/>
				{/if}

				<!-- Data points (time) -->
				{#each data as d, i}
					<circle
						cx={xPos(i)}
						cy={timeY(d.predictedTime)}
						r={hoverIdx === i ? 5 : 3.5}
						fill={BLUE}
						stroke="white"
						stroke-width="1.5"
					/>
				{/each}

				<!-- Data points (pace) -->
				{#each data as d, i}
					<circle
						cx={xPos(i)}
						cy={paceY(d.predictedPace)}
						r={hoverIdx === i ? 5 : 3.5}
						fill={RED}
						stroke="white"
						stroke-width="1.5"
					/>
				{/each}

				<!-- Hover detection overlay -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<rect
					x={0}
					y={0}
					width={cw}
					height={ch}
					fill="transparent"
					onmousemove={handleMouseMove}
					onmouseleave={handleMouseLeave}
				/>

				<!-- Hover crosshair + tooltip -->
				{#if hoverIdx !== null && data[hoverIdx]}
					{@const d = data[hoverIdx]}
					{@const hx = xPos(hoverIdx)}

					<!-- Vertical guide line -->
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

					<!-- Tooltip background -->
					{@const tx = hx < cw / 2 ? hx + 12 : hx - 160}
					<rect
						x={tx}
						y={4}
						width="148"
						height="60"
						rx="6"
						class="fill-current text-card"
						stroke="currentColor"
						stroke-width="0.5"
					/>
					<text
						x={tx + 8}
						y={20}
						style="font-size:11px;font-weight:600"
						class="fill-current text-card-foreground"
					>
						{formatDateShort(d.date)}
					</text>
					<text x={tx + 8} y={36} style="font-size:10px" fill={BLUE}>
						Time: {d.formattedTime}
					</text>
					<text x={tx + 8} y={52} style="font-size:10px" fill={RED}>
						<!--
							Computed from the time when the axes are tied together, so the
							tooltip agrees with the axis beside it rather than showing the
							rounded pace that was stored.
						-->
						Pace: {coupled
							? `${secondsToPaceString(Math.round(d.predictedTime / distanceKm!))} /km`
							: d.formattedPace}
					</text>
				{/if}
			</g>
		</svg>
	{/if}
</div>
