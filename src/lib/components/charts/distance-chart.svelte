<script lang="ts">
	import { TrendingUp } from 'lucide-svelte';
	import { formatKm, type DistanceSeries } from '$lib/utils/distance-graph';

	let {
		series,
		emptyMessage = 'No distance data for this period yet'
	}: {
		series: DistanceSeries;
		emptyMessage?: string;
	} = $props();

	// Layout constants. `right` leaves room for the last x label to sit under
	// its point without running off the edge.
	//
	// Deliberately shorter than the prediction chart it shares a slot with: two
	// series over seven days does not need the height a continuous prediction
	// trend does, and the card should not jump taller when the picker changes.
	// Shared with the prediction chart in the same picker — see the note there
	// on why they are both this tall.
	const HEIGHT = 260;
	const PAD = { top: 14, right: 16, bottom: 44, left: 34 };

	let containerWidth = $state(500);

	const cw = $derived(Math.max(0, containerWidth - PAD.left - PAD.right));
	const ch = HEIGHT - PAD.top - PAD.bottom;

	const points = $derived(series.points);

	/**
	 * Both series share one scale, always from zero.
	 *
	 * One axis on purpose: done and planned are the same measure in the same
	 * unit, and the whole point of the graph is that they are directly
	 * comparable. A second scale would make a shortfall look like a match.
	 */
	const maxValue = $derived.by(() => {
		const vals = points.flatMap((p) => [p.doneKm, p.todoKm]);
		const max = Math.max(0, ...vals);
		return max > 0 ? max : 1;
	});

	function xPos(i: number): number {
		if (points.length <= 1) return cw / 2;
		return (i / (points.length - 1)) * cw;
	}

	function yPos(v: number): number {
		return ch - (v / maxValue) * ch;
	}

	function linePath(get: (p: (typeof points)[number]) => number): string {
		return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xPos(i)},${yPos(get(p))}`).join(' ');
	}

	/** The line, closed down to the baseline, so it can be filled. */
	function areaPath(get: (p: (typeof points)[number]) => number): string {
		if (points.length === 0) return '';
		const last = points.length - 1;
		return `${linePath(get)} L${xPos(last)},${ch} L${xPos(0)},${ch} Z`;
	}

	const todoLine = $derived(linePath((p) => p.todoKm));
	const doneLine = $derived(linePath((p) => p.doneKm));
	const todoArea = $derived(areaPath((p) => p.todoKm));

	/**
	 * Top of the scale and the baseline, plus the peak actually run.
	 *
	 * Three labels rather than an even ladder: the numbers worth reading off
	 * this graph are the biggest week planned, the biggest week run, and zero.
	 * The peak is dropped when it would collide with the top label.
	 */
	const yTicks = $derived.by(() => {
		const ticks = [{ value: maxValue, label: round(maxValue) }];
		const doneMax = Math.max(0, ...points.map((p) => p.doneKm));
		if (doneMax > 0 && (maxValue - doneMax) / maxValue > 0.08) {
			ticks.push({ value: doneMax, label: round(doneMax) });
		}
		ticks.push({ value: 0, label: '0' });
		return ticks;
	});

	function round(v: number): string {
		return v >= 10 ? String(Math.round(v)) : String(Math.round(v * 10) / 10);
	}

	/**
	 * Thin the x labels until they fit.
	 *
	 * Seven weekdays always fit; a goal of thirty weeks does not, so every nth
	 * is drawn — with the last one always kept, because "where does the plan
	 * end" is a question people ask of this graph.
	 */
	const xLabels = $derived.by(() => {
		if (points.length === 0) return [];
		const minSpacing = 28;
		const step = Math.max(1, Math.ceil(points.length / Math.max(1, Math.floor(cw / minSpacing))));
		const shown = points.map((p, i) => ({ i, label: p.label })).filter(({ i }) => i % step === 0);
		const last = points.length - 1;
		if (shown[shown.length - 1]?.i !== last) shown.push({ i: last, label: points[last].label });
		return shown;
	});

	// ── Hover ──────────────────────────────────────────────────────
	let hoverIdx = $state<number | null>(null);

	function handleMove(e: MouseEvent) {
		if (points.length === 0) return;
		const svg = (e.currentTarget as SVGElement).closest('svg');
		if (!svg) return;
		const rect = svg.getBoundingClientRect();
		// The viewBox can lag the rendered width by a frame after a resize, so
		// convert the pointer into viewBox units rather than assuming 1:1.
		const scale = rect.width > 0 ? Math.max(1, containerWidth) / rect.width : 1;
		const mx = (e.clientX - rect.left) * scale - PAD.left;
		if (points.length === 1) {
			hoverIdx = 0;
			return;
		}
		const seg = cw / (points.length - 1);
		hoverIdx = Math.max(0, Math.min(points.length - 1, Math.round(mx / seg)));
	}

	// ── Totals bar ─────────────────────────────────────────────────
	const completion = $derived(
		series.totalTodoKm > 0 ? Math.min(1, series.totalDoneKm / series.totalTodoKm) : 0
	);

	const DONE = '#a855f7';
	const TODO = '#ef4444';
	const TOOLTIP_W = 132;
	const TOOLTIP_H = 58;
</script>

<div class="w-full min-w-0" bind:clientWidth={containerWidth}>
	{#if points.length === 0}
		<div class="flex flex-col items-center justify-center py-16 text-center">
			<TrendingUp class="mb-3 h-10 w-10 text-muted-foreground/40" />
			<p class="text-sm font-medium text-muted-foreground">{emptyMessage}</p>
		</div>
	{:else}
		<!--
			Legend, with two lines of room whether or not two are used. The
			prediction chart in the same picker carries a third entry when a
			forecast is drawn and wraps; this one never does. Letting each row size
			itself makes the card jump by a line every time the picker moves
			between them.
		-->
		<div class="mb-0.5 flex min-h-[2.25rem] flex-wrap items-center gap-5 text-xs">
			<span class="flex items-center gap-2">
				<span class="inline-block h-2.5 w-2.5 rounded-full" style="background:{DONE}"></span>
				<span class="text-muted-foreground">Done</span>
			</span>
			<span class="flex items-center gap-2">
				<span class="inline-block h-2.5 w-2.5 rounded-full" style="background:{TODO}"></span>
				<span class="text-muted-foreground">To do [{series.unit}]</span>
			</span>
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
				aria-label="Distance done against distance planned, by {series.axisLabel.toLowerCase()}"
			>
				<defs>
					<linearGradient id="distance-fill" x1="0" y1="0" x2="0" y2="1">
						<stop offset="0%" stop-color={TODO} stop-opacity="0.28" />
						<stop offset="100%" stop-color={TODO} stop-opacity="0.02" />
					</linearGradient>
				</defs>

				<g transform="translate({PAD.left},{PAD.top})">
					<!-- Y axis line and its labels -->
					<line x1={0} y1={0} x2={0} y2={ch} stroke="currentColor" class="text-border" />
					{#each yTicks as tick (tick.value)}
						<text
							x={-8}
							y={yPos(tick.value)}
							text-anchor="end"
							dominant-baseline="middle"
							class="fill-current text-muted-foreground"
							style="font-size:11px"
						>
							{tick.label}
						</text>
					{/each}

					<!-- X axis -->
					<line x1={0} y1={ch} x2={cw} y2={ch} stroke="currentColor" class="text-border" />

					<!-- Filled area under the planned line -->
					<path d={todoArea} fill="url(#distance-fill)" stroke="none" />

					<!-- Lines -->
					<path
						d={todoLine}
						fill="none"
						stroke={TODO}
						stroke-width="2"
						stroke-linejoin="round"
						stroke-linecap="round"
					/>
					<path
						d={doneLine}
						fill="none"
						stroke={DONE}
						stroke-width="2"
						stroke-linejoin="round"
						stroke-linecap="round"
					/>

					<!-- Markers. Drawn after the lines so they sit on top, and ringed in
				     the surface colour so overlapping points stay countable. -->
					{#each points as p, i (i)}
						<circle
							cx={xPos(i)}
							cy={yPos(p.todoKm)}
							r={hoverIdx === i || p.isCurrent ? 5 : 3.5}
							fill={TODO}
							class="stroke-card"
							stroke-width="2"
						/>
					{/each}
					{#each points as p, i (i)}
						<circle
							cx={xPos(i)}
							cy={yPos(p.doneKm)}
							r={hoverIdx === i || p.isCurrent ? 5 : 3.5}
							fill={DONE}
							class="stroke-card"
							stroke-width="2"
						/>
					{/each}

					<!-- X labels -->
					{#each xLabels as { i, label } (i)}
						<text
							x={xPos(i)}
							y={ch + 17}
							text-anchor="middle"
							class="fill-current"
							class:text-foreground={points[i].isCurrent}
							class:text-muted-foreground={!points[i].isCurrent}
							style="font-size:11px;font-weight:{points[i].isCurrent ? 600 : 400}"
						>
							{label}
						</text>
					{/each}

					<!-- Axis caption -->
					<text
						x={cw / 2}
						y={ch + 34}
						text-anchor="middle"
						class="fill-current text-muted-foreground"
						style="font-size:11px"
					>
						{series.axisLabel}
					</text>

					<!-- Hover surface -->
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

					{#if hoverIdx !== null && points[hoverIdx]}
						{@const p = points[hoverIdx]}
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
							{p.fullLabel}
						</text>
						<text
							x={tx + 10}
							y={38}
							class="fill-current text-muted-foreground"
							style="font-size:11px"
						>
							Done {formatKm(p.doneKm, series.unit)}
						</text>
						<text
							x={tx + 10}
							y={53}
							class="fill-current text-muted-foreground"
							style="font-size:11px"
						>
							To do {formatKm(p.todoKm, series.unit)}
						</text>
					{/if}
				</g>
			</svg>
		</div>

		<!--
			The period total, and how far into it this runner is.

			A read-out, not a control: the knob marks where `done` falls against
			the plan, so the same pair of numbers that the columns add up to is
			also legible at a glance.
		-->
		<div class="mt-0.5">
			<!-- Both totals on one line, so the read-out costs one row rather than
			     three. The bar underneath places `done` against the plan. -->
			<div class="flex items-baseline justify-between text-xs">
				<span class="font-semibold text-foreground">
					{formatKm(series.totalDoneKm, series.unit)}
				</span>
				<span class="text-muted-foreground">
					of {formatKm(series.totalTodoKm, series.unit)}
				</span>
			</div>
			<div
				class="relative mt-1 h-1.5 w-full rounded-full"
				style="background:linear-gradient(to right,{TODO},{DONE})"
			>
				<span
					class="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground ring-2 ring-card"
					style="left:{completion * 100}%"
					aria-hidden="true"
				></span>
			</div>
			<p class="sr-only">
				{formatKm(series.totalDoneKm, series.unit)} done of {formatKm(
					series.totalTodoKm,
					series.unit
				)} planned.
			</p>
		</div>
	{/if}
</div>
