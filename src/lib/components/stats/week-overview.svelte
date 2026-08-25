<script lang="ts">
	import { Footprints, Ruler, Dumbbell } from 'lucide-svelte';
	import { hasRing, ringFraction, type WeekProgress } from '$lib/utils/week-progress';
	import { formatKm } from '$lib/utils/distance-graph';

	let {
		progress,
		/** Compact drops the ring diameter and the labels for the navbar. */
		compact = false
	}: {
		progress: WeekProgress;
		compact?: boolean;
	} = $props();

	const size = $derived(compact ? 34 : 56);
	const stroke = $derived(compact ? 3 : 4);
	const radius = $derived((size - stroke) / 2);
	const circumference = $derived(2 * Math.PI * radius);

	/** Reads the same as the ring: no "of 0" when nothing was planned. */
	function countLabel(done: number, planned: number, noun: string): string {
		return planned > 0
			? `${done} of ${planned} ${noun} done this week`
			: `${done} unplanned ${noun} done this week`;
	}

	function distanceLabel(distance: WeekProgress['distance']): string {
		const done = formatKm(distance.doneKm, distance.unit);
		return distance.plannedKm > 0
			? `${done} of ${formatKm(distance.plannedKm, distance.unit)} done this week`
			: `${done} done this week, none planned`;
	}

	const rings = $derived(
		[
			{
				key: 'sessions',
				icon: Footprints,
				fraction: ringFraction(progress.sessions.done, progress.sessions.planned),
				done: String(progress.sessions.done),
				planned: String(progress.sessions.planned),
				label: countLabel(progress.sessions.done, progress.sessions.planned, 'run sessions'),
				doneValue: progress.sessions.done,
				plannedValue: progress.sessions.planned
			},
			{
				key: 'distance',
				icon: Ruler,
				fraction: ringFraction(progress.distance.doneKm, progress.distance.plannedKm),
				done: formatKm(progress.distance.doneKm, progress.distance.unit),
				planned: formatKm(progress.distance.plannedKm, progress.distance.unit),
				label: `${formatKm(progress.distance.doneKm, progress.distance.unit)} of ${formatKm(
					progress.distance.plannedKm,
					progress.distance.unit
				)} done this week`,
				doneValue: progress.distance.doneKm,
				plannedValue: progress.distance.plannedKm
			},
			{
				key: 'strength',
				icon: Dumbbell,
				fraction: ringFraction(progress.strength.done, progress.strength.planned),
				done: String(progress.strength.done),
				planned: String(progress.strength.planned),
				label: countLabel(progress.strength.done, progress.strength.planned, 'strength sessions'),
				doneValue: progress.strength.done,
				plannedValue: progress.strength.planned
			}
			// A `0 / 0` ring is dropped rather than drawn empty — see `hasRing`.
		].filter((ring) => hasRing(ring.doneValue, ring.plannedValue))
	);
</script>

<div class="flex items-center {compact ? 'gap-3 sm:gap-5' : 'gap-6'}" aria-label="This week">
	{#each rings as ring (ring.key)}
		{@const Icon = ring.icon}
		<div class="flex items-center gap-2" title={ring.label}>
			<span class="relative inline-flex shrink-0" style="width:{size}px;height:{size}px">
				<svg width={size} height={size} class="-rotate-90" aria-hidden="true">
					<circle
						cx={size / 2}
						cy={size / 2}
						r={radius}
						fill="none"
						stroke="currentColor"
						class="text-muted"
						stroke-width={stroke}
					/>
					<!-- Nothing planned means no arc at all, rather than a full ring
					     claiming a week's work is finished. See `ringFraction`. -->
					{#if ring.fraction > 0}
						<circle
							cx={size / 2}
							cy={size / 2}
							r={radius}
							fill="none"
							stroke="var(--color-primary)"
							stroke-width={stroke}
							stroke-linecap="round"
							stroke-dasharray="{circumference * ring.fraction} {circumference}"
						/>
					{/if}
				</svg>
				<Icon
					class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 {compact
						? 'h-3.5 w-3.5'
						: 'h-5 w-5'} text-foreground"
				/>
			</span>
			<span class="leading-tight whitespace-nowrap">
				<span class="{compact ? 'text-sm' : 'text-lg'} font-bold text-foreground">{ring.done}</span>
				<!-- Nothing planned means no denominator to show: "14.2 km / 0 km"
				     reads as a shortfall when it is the opposite. -->
				{#if ring.plannedValue > 0}
					<span class="{compact ? 'text-xs' : 'text-sm'} text-muted-foreground"
						>/ {ring.planned}</span
					>
				{/if}
			</span>
			<span class="sr-only">{ring.label}</span>
		</div>
	{/each}
</div>
