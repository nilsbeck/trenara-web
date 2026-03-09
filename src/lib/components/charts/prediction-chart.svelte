<script lang="ts">
	import { Loader2, TrendingDown } from 'lucide-svelte';
	import { secondsToTimeString, secondsToPaceString, formatDateShort } from '$lib/utils/format';

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
		error = null
	}: {
		data: ChartDataPoint[];
		loading?: boolean;
		error?: string | null;
	} = $props();

	// Layout constants
	const HEIGHT = 300;
	const PAD = { top: 24, right: 64, bottom: 44, left: 64 };

	// Responsive container width
	let containerWidth = $state(500);

	const cw = $derived(Math.max(0, containerWidth - PAD.left - PAD.right));
	const ch = HEIGHT - PAD.top - PAD.bottom;

	// ── Scale extents ──────────────────────────────────────────────
	const timeExtent = $derived.by(() => {
		if (data.length === 0) return { min: 0, max: 1 };
		const vals = data.map((d) => d.predictedTime);
		const min = Math.min(...vals);
		const max = Math.max(...vals);
		const pad = (max - min) * 0.12 || 60;
		return { min: min - pad, max: max + pad };
	});

	const paceExtent = $derived.by(() => {
		if (data.length === 0) return { min: 0, max: 1 };
		const vals = data.map((d) => d.predictedPace);
		const min = Math.min(...vals);
		const max = Math.max(...vals);
		const pad = (max - min) * 0.12 || 10;
		return { min: min - pad, max: max + pad };
	});

	// ── Scale functions ────────────────────────────────────────────
	function xPos(i: number): number {
		if (data.length <= 1) return cw / 2;
		return (i / (data.length - 1)) * cw;
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

	const xLabels = $derived.by(() => {
		if (data.length === 0) return [];
		if (data.length <= 6) return data.map((d, i) => ({ i, label: formatDateShort(d.date) }));
		const step = Math.ceil(data.length / 5);
		const labels: { i: number; label: string }[] = [];
		for (let idx = 0; idx < data.length; idx += step) {
			labels.push({ i: idx, label: formatDateShort(data[idx].date) });
		}
		const lastIdx = data.length - 1;
		if (labels[labels.length - 1]?.i !== lastIdx) {
			labels.push({ i: lastIdx, label: formatDateShort(data[lastIdx].date) });
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
		if (data.length === 1) {
			hoverIdx = 0;
			return;
		}
		const segWidth = cw / (data.length - 1);
		const idx = Math.round(mx / segWidth);
		hoverIdx = Math.max(0, Math.min(data.length - 1, idx));
	}

	function handleMouseLeave() {
		hoverIdx = null;
	}

	const BLUE = '#2563eb';
	const RED = '#dc2626';
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
				<span class="text-muted-foreground">Predicted Time</span>
			</span>
			<span class="flex items-center gap-1.5">
				<span class="inline-block h-0.5 w-4 rounded" style="background:{RED}"></span>
				<span class="text-muted-foreground">Predicted Pace</span>
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
					<line x1={0} y1={y} x2={cw} y2={y} stroke="currentColor" class="text-border" stroke-dasharray="3,3" />
				{/each}

				<!-- X axis -->
				<line x1={0} y1={ch} x2={cw} y2={ch} stroke="currentColor" class="text-border" />

				<!-- Y-left axis (time) -->
				<line x1={0} y1={0} x2={0} y2={ch} stroke={BLUE} opacity="0.3" />
				{#each timeTicks as tick}
					{@const y = timeY(tick)}
					<text x={-8} {y} text-anchor="end" dominant-baseline="middle" class="fill-current text-muted-foreground" style="font-size:10px">
						{secondsToTimeString(tick)}
					</text>
				{/each}
				<text
					x={-8}
					y={-12}
					text-anchor="end"
					style="font-size:9px;fill:{BLUE}"
				>
					Time
				</text>

				<!-- Y-right axis (pace) -->
				<line x1={cw} y1={0} x2={cw} y2={ch} stroke={RED} opacity="0.3" />
				{#each paceTicks as tick}
					{@const y = paceY(tick)}
					<text x={cw + 8} {y} text-anchor="start" dominant-baseline="middle" class="fill-current text-muted-foreground" style="font-size:10px">
						{secondsToPaceString(tick)}
					</text>
				{/each}
				<text
					x={cw + 8}
					y={-12}
					text-anchor="start"
					style="font-size:9px;fill:{RED}"
				>
					Pace
				</text>

				<!-- X labels -->
				{#each xLabels as { i, label }}
					<text x={xPos(i)} y={ch + 20} text-anchor="middle" class="fill-current text-muted-foreground" style="font-size:10px">
						{label}
					</text>
				{/each}

				<!-- Time line -->
				{#if data.length > 1}
					<path d={timePath} fill="none" stroke={BLUE} stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" />
				{/if}

				<!-- Pace line -->
				{#if data.length > 1}
					<path d={pacePath} fill="none" stroke={RED} stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" />
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
					<line x1={hx} y1={0} x2={hx} y2={ch} stroke="currentColor" class="text-muted-foreground" stroke-dasharray="2,2" opacity="0.5" />

					<!-- Tooltip background -->
					{@const tx = hx < cw / 2 ? hx + 12 : hx - 160}
					<rect x={tx} y={4} width="148" height="60" rx="6" class="fill-current text-card" stroke="currentColor" stroke-width="0.5" />
					<text x={tx + 8} y={20} style="font-size:11px;font-weight:600" class="fill-current text-card-foreground">
						{formatDateShort(d.date)}
					</text>
					<text x={tx + 8} y={36} style="font-size:10px" fill={BLUE}>
						Time: {d.formattedTime}
					</text>
					<text x={tx + 8} y={52} style="font-size:10px" fill={RED}>
						Pace: {d.formattedPace}
					</text>
				{/if}
			</g>
		</svg>
	{/if}
</div>
