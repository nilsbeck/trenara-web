<script lang="ts">
	import { Activity } from 'lucide-svelte';
	import { formatDateShort, secondsToTimeString } from '$lib/utils/format';

	/**
	 * One day's endurance shape.
	 *
	 * The exponent only — the level is the other chart. A point exists for a day
	 * whose own predictions fixed the exponent; a borrowed one is a copy of a
	 * neighbouring day and has no business being a vertex on a line about change.
	 */
	export interface EnduranceDataPoint {
		date: string;
		exponent: number;
	}

	let {
		data = [],
		referenceTenKSeconds = null
	}: {
		data: EnduranceDataPoint[];
		/**
		 * Today's 10K prediction, to price the change in.
		 *
		 * The exponent on its own is a number nobody has intuition for. Held
		 * against a 10K it becomes minutes of marathon, which is the sentence this
		 * chart exists to be able to say.
		 */
		referenceTenKSeconds?: number | null;
	} = $props();

	const HEIGHT = 220;
	const DAY_MS = 86_400_000;
	const PAD = { top: 14, right: 16, bottom: 44, left: 54 };
	const LINE = '#2dd4bf';

	/** Distances the axis is priced in, as multiples of the 10K. */
	const MARATHON_KM = 42.195;
	const TEN_K = 10;

	let containerWidth = $state(500);
	let hover = $state<number | null>(null);

	const cw = $derived(Math.max(0, containerWidth - PAD.left - PAD.right));
	const ch = HEIGHT - PAD.top - PAD.bottom;

	/** What a marathon costs at this exponent, as a multiple of the same 10K. */
	function marathonMultiple(exponent: number): number {
		return Math.pow(MARATHON_KM / TEN_K, exponent);
	}

	/**
	 * The window the readings occupy, never a zero baseline.
	 *
	 * The exponent lives between about 1.02 and 1.12 across everybody, and one
	 * runner moves through a fraction of that. Anchored at zero the whole series
	 * would be a straight line at the top of the plot; the axis carries no zero
	 * and says so by labelling the readings themselves.
	 */
	const extent = $derived.by(() => {
		if (data.length === 0) return { min: 0, max: 1 };
		const vals = data.map((d) => d.exponent);
		const min = Math.min(...vals);
		const max = Math.max(...vals);
		// A flat series still needs a band to sit in the middle of.
		const pad = (max - min) * 0.18 || 0.01;
		return { min: min - pad, max: max + pad };
	});

	const stamps = $derived(data.map((d) => new Date(d.date).getTime()));

	const xDomain = $derived.by(() => {
		if (stamps.length === 0) return { min: 0, max: 1 };
		const min = Math.min(...stamps);
		const max = Math.max(...stamps);
		return max > min ? { min, max } : { min: min - DAY_MS / 2, max: min + DAY_MS / 2 };
	});

	function xPos(i: number): number {
		const { min, max } = xDomain;
		return (((stamps[i] ?? min) - min) / (max - min)) * cw;
	}

	function yPos(v: number): number {
		const range = extent.max - extent.min;
		if (range === 0) return ch / 2;
		return ch - ((v - extent.min) / range) * ch;
	}

	const linePath = $derived(
		data.map((d, i) => `${i === 0 ? 'M' : 'L'}${xPos(i)},${yPos(d.exponent)}`).join(' ')
	);

	const areaPath = $derived.by(() => {
		if (data.length === 0) return '';
		return `${linePath} L${xPos(data.length - 1)},${ch} L${xPos(0)},${ch} Z`;
	});

	/**
	 * The most endurance-shaped day, the least, and where it stands now.
	 *
	 * Three labels rather than an even ladder, matching the prediction chart:
	 * on a series this tightly bunched those are the numbers worth reading off.
	 */
	const yTicks = $derived.by(() => {
		if (data.length === 0) return [];
		const vals = data.map((d) => d.exponent);
		const best = Math.min(...vals);
		const worst = Math.max(...vals);
		const latest = vals[vals.length - 1];
		const ticks = [worst, best];
		const span = worst - best;
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

	const xLabels = $derived.by(() => {
		if (data.length === 0) return [];
		const picked: { x: number; label: string; isLatest: boolean }[] = [];

		for (let i = data.length - 1; i >= 0; i--) {
			const x = xPos(i);
			if (picked.length > 0 && picked[picked.length - 1].x - x < MIN_LABEL_SPACING) continue;
			picked.push({ x, label: formatDateShort(data[i].date), isLatest: i === data.length - 1 });
		}

		return picked.reverse();
	});

	const hovered = $derived.by(() => {
		if (hover === null) return null;
		const d = data[hover];
		if (!d) return null;

		const lines = [`Marathon ${marathonMultiple(d.exponent).toFixed(2)}x your 10K`];
		if (referenceTenKSeconds !== null) {
			lines.push(
				`At today's 10K: ${secondsToTimeString(Math.round(referenceTenKSeconds * marathonMultiple(d.exponent)))}`
			);
		}
		lines.push(`Riegel exponent ${d.exponent.toFixed(4)}`);

		return { x: xPos(hover), title: formatDateShort(d.date), lines };
	});

	const TOOLTIP_MIN_W = 150;
	const TOOLTIP_LINE_H = 15;

	const tooltip = $derived.by(() => {
		if (!hovered) return null;
		const longest = Math.max(hovered.title.length, ...hovered.lines.map((l) => l.length));
		const width = Math.min(Math.max(TOOLTIP_MIN_W, longest * 6 + 20), Math.max(TOOLTIP_MIN_W, cw));
		return {
			width,
			height: 26 + hovered.lines.length * TOOLTIP_LINE_H,
			x: Math.max(0, Math.min(cw - width, hovered.x - width / 2))
		};
	});

	function handleMove(e: MouseEvent) {
		if (data.length === 0) return;
		const svg = (e.currentTarget as SVGElement).closest('svg');
		if (!svg) return;
		const rect = svg.getBoundingClientRect();
		const scale = rect.width > 0 ? Math.max(1, containerWidth) / rect.width : 1;
		const mx = (e.clientX - rect.left) * scale - PAD.left;

		let best = Infinity;
		let pick: number | null = null;
		for (let i = 0; i < data.length; i++) {
			const distance = Math.abs(xPos(i) - mx);
			if (distance < best) {
				best = distance;
				pick = i;
			}
		}
		hover = pick;
	}

	/**
	 * What the change in shape is worth, in marathon minutes at today's fitness.
	 *
	 * The whole point of separating the two charts: this number is what a runner
	 * gained *without* getting faster over 10K. Priced at the current 10K
	 * prediction so it answers "where does this leave me now" rather than
	 * describing a marathon they were predicted years ago.
	 */
	const summary = $derived.by(() => {
		if (data.length === 0) return null;
		const first = data[0];
		const latest = data[data.length - 1];
		const multiple = marathonMultiple(latest.exponent);

		if (data.length < 2 || referenceTenKSeconds === null) {
			return { multiple, gainedSeconds: null, since: first.date };
		}

		const gainedSeconds = referenceTenKSeconds * (marathonMultiple(first.exponent) - multiple);
		return { multiple, gainedSeconds, since: first.date };
	});

	/** Whole minutes, which is the resolution this comparison deserves. */
	function minutes(seconds: number): string {
		const total = Math.round(Math.abs(seconds) / 60);
		return `${total} min`;
	}
</script>

<div class="w-full min-w-0" bind:clientWidth={containerWidth}>
	{#if data.length === 0}
		<div class="flex flex-col items-center justify-center py-12 text-center">
			<Activity class="mb-3 h-9 w-9 text-muted-foreground/40" />
			<p class="text-sm font-medium text-muted-foreground">No endurance readings yet</p>
			<p class="mt-1 text-xs text-muted-foreground">
				A day counts once its own predictions cover two distances. Keep visiting your dashboard and
				this fills in.
			</p>
		</div>
	{:else}
		<div class="mb-0.5 flex min-h-[1.5rem] flex-wrap items-center gap-x-4 gap-y-0.5 text-xs">
			<span class="flex items-center gap-2">
				<span class="inline-block h-2.5 w-2.5 rounded-full" style="background:{LINE}"></span>
				<span class="text-muted-foreground">Marathon cost, as a multiple of your 10K</span>
			</span>
		</div>

		<div class="w-full">
			<svg
				viewBox="0 0 {containerWidth} {HEIGHT}"
				width="100%"
				height={HEIGHT}
				role="img"
				aria-label="Endurance shape over time"
			>
				<defs>
					<linearGradient id="endurance-fill" x1="0" y1="0" x2="0" y2="1">
						<stop offset="0%" stop-color={LINE} stop-opacity="0.28" />
						<stop offset="100%" stop-color={LINE} stop-opacity="0.02" />
					</linearGradient>
				</defs>

				<g transform="translate({PAD.left},{PAD.top})">
					<line x1={0} y1={0} x2={0} y2={ch} stroke="currentColor" class="text-border" />
					<line x1={0} y1={ch} x2={cw} y2={ch} stroke="currentColor" class="text-border" />

					{#each yTicks as tick (tick)}
						{@const y = yPos(tick)}
						<text
							x={-8}
							{y}
							text-anchor="end"
							dominant-baseline="middle"
							class="fill-current text-muted-foreground"
							style="font-size:10px"
						>
							{marathonMultiple(tick).toFixed(2)}x
						</text>
					{/each}

					<path d={areaPath} fill="url(#endurance-fill)" stroke="none" />

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

					{#each data as d, i (d.date)}
						{@const isLatest = i === data.length - 1}
						<circle
							cx={xPos(i)}
							cy={yPos(d.exponent)}
							r={hover === i || isLatest ? 5 : 3.5}
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
						onmouseleave={() => (hover = null)}
					/>

					<!-- Nothing above the tracking surface may take the pointer, or
					     moving onto the tooltip clears the hover that drew it. -->
					{#if hovered && tooltip}
						<g class="pointer-events-none">
							<line
								x1={hovered.x}
								y1={0}
								x2={hovered.x}
								y2={ch}
								stroke="currentColor"
								class="text-muted-foreground"
								stroke-dasharray="2,2"
								opacity="0.5"
							/>
							<rect
								x={tooltip.x}
								y={4}
								width={tooltip.width}
								height={tooltip.height}
								rx="6"
								class="fill-popover stroke-border"
								stroke-width="1"
							/>
							<text
								x={tooltip.x + 10}
								y={21}
								class="fill-current text-popover-foreground"
								style="font-size:11px;font-weight:600"
							>
								{hovered.title}
							</text>
							{#each hovered.lines as line, i (i)}
								<text
									x={tooltip.x + 10}
									y={38 + i * TOOLTIP_LINE_H}
									class="fill-current text-muted-foreground"
									style="font-size:11px"
								>
									{line}
								</text>
							{/each}
						</g>
					{/if}
				</g>
			</svg>
		</div>

		{#if summary}
			<div class="mt-0.5 flex flex-wrap items-baseline justify-between gap-x-3 text-xs">
				<span class="font-semibold text-foreground">{summary.multiple.toFixed(2)}x</span>
				{#if summary.gainedSeconds !== null && Math.abs(summary.gainedSeconds) >= 30}
					<span class:text-foreground={summary.gainedSeconds > 0} class="text-muted-foreground">
						{minutes(summary.gainedSeconds)}
						{summary.gainedSeconds > 0 ? 'of marathon gained' : 'of marathon lost'} on shape alone since
						{formatDateShort(summary.since)}
					</span>
				{:else}
					<span class="text-muted-foreground">
						Endurance shape steady since {formatDateShort(summary.since)}
					</span>
				{/if}
			</div>
		{/if}
	{/if}
</div>
