<script lang="ts">
	import { Footprints } from 'lucide-svelte';
	import { shortfallKm, volumeBar, type WeekVolume } from '$lib/utils/week-volume';
	import { formatDistanceValue, formatKm } from '$lib/utils/distance-graph';

	let { volume }: { volume: WeekVolume } = $props();

	/**
	 * Rounding noise, in kilometres. The totals and the day rows come from
	 * different fields of the same response and need not agree to the metre —
	 * a 10 m "shortfall" is arithmetic, not a missed session.
	 */
	const EPSILON = 0.05;

	const bar = $derived(volumeBar(volume));
	const missedKm = $derived(shortfallKm(volume));
	const overKm = $derived(volume.doneKm - volume.plannedKm);
	const hasMissed = $derived(missedKm > EPSILON);

	/** Fraction of the track as a CSS percentage. */
	function pct(fraction: number): string {
		return `${(fraction * 100).toFixed(2)}%`;
	}

	/**
	 * The one thing worth saying beside the numbers, shortest first.
	 *
	 * Kilometres already out of reach outrank kilometres still to go: a runner
	 * who has missed a session needs to know the week's ceiling has moved
	 * before they need to know how far is left under it. The unit is on the
	 * plan beside this, so it is not repeated here.
	 */
	const hint = $derived.by(() => {
		if (volume.plannedKm <= 0) return 'none planned';
		if (hasMissed) return `${formatDistanceValue(missedKm)} missed`;
		if (overKm > EPSILON) return `+${formatDistanceValue(overKm)} over`;
		// "0 to go" is a week finished, and should say so.
		if (overKm > -EPSILON) return 'complete';
		return `${formatDistanceValue(-overKm)} to go`;
	});

	/** The whole state as a sentence, for the tooltip and for screen readers. */
	const label = $derived.by(() => {
		if (volume.plannedKm <= 0) {
			return `${formatKm(volume.doneKm, volume.unit)} run this week, none planned`;
		}

		const of = `${formatDistanceValue(volume.doneKm)} of ${formatKm(
			volume.plannedKm,
			volume.unit
		)} run this week`;

		if (hasMissed) {
			return `${of}, ${formatKm(missedKm, volume.unit)} no longer reachable — a planned day has gone by`;
		}
		if (overKm > EPSILON) return `${of}, ${formatKm(overKm, volume.unit)} over`;
		if (overKm > -EPSILON) return `${of} — the week is complete`;
		return `${of}, ${formatKm(-overKm, volume.unit)} to go`;
	});
</script>

<div class="flex items-center gap-2.5" title={label}>
	<Footprints class="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />

	<div class="flex w-40 flex-col gap-1 sm:w-52">
		<div class="flex items-baseline justify-between gap-3 leading-none">
			<span class="whitespace-nowrap">
				<span class="text-sm font-bold text-foreground">
					{volume.plannedKm > 0
						? formatDistanceValue(volume.doneKm)
						: formatKm(volume.doneKm, volume.unit)}
				</span>
				<!-- Nothing planned means no denominator to show: "14.2 / 0 km"
				     reads as a shortfall when it is the opposite. -->
				{#if volume.plannedKm > 0}
					<span class="text-xs text-muted-foreground">
						/ {formatKm(volume.plannedKm, volume.unit)}
					</span>
				{/if}
			</span>
			<span class="whitespace-nowrap text-xs text-muted-foreground">{hint}</span>
		</div>

		<!--
			The week on one track, which is the plan until something passes it.
			Four marks, back to front: what a missed day has put out of reach,
			what is still ahead, what is run, and the plan's own 100% — see
			`volumeBar` for the geometry.
		-->
		<div class="relative h-1.5 overflow-hidden rounded-full bg-border" aria-hidden="true">
			{#if hasMissed}
				<span
					class="absolute inset-y-0 bg-dot-missed/40"
					style="left:{pct(bar.reachable)};right:{pct(1 - bar.planned)}"
				></span>
			{/if}
			{#if bar.reachable > bar.done}
				<span
					class="absolute inset-y-0 bg-primary/25"
					style="left:{pct(bar.done)};right:{pct(1 - bar.reachable)}"
				></span>
			{/if}
			<span class="absolute inset-y-0 left-0 rounded-full bg-primary" style="width:{pct(bar.done)}"
			></span>
			<!--
				The mark is only drawn once the track has grown past the plan and
				left it somewhere to sit. Until then the plan *is* the end of the
				track, and a line ruled down the last two pixels of a rounded bar
				reads as a rendering artefact rather than as a milestone.
			-->
			{#if bar.planned > 0 && bar.planned < 1}
				<span
					class="absolute inset-y-0 w-0.5 -translate-x-1/2 rounded-full bg-foreground/70"
					style="left:{pct(bar.planned)}"
				></span>
			{/if}
		</div>
	</div>

	<span class="sr-only">{label}</span>
</div>
