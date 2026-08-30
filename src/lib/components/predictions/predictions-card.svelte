<script lang="ts">
	import type { UserStats } from '$lib/server/trenara/types';
	import { Timer } from 'lucide-svelte';
	import { riegelCurve } from '$lib/utils/race-equivalent';
	import {
		timeStringToSeconds,
		secondsToDuration,
		secondsToPaceString,
		NO_VALUE
	} from '$lib/utils/format';

	let { userStats }: { userStats: UserStats } = $props();

	const races = $derived([
		{
			name: '5 km',
			km: 5,
			time: userStats.best_times.time_for_5,
			pace: userStats.best_times.pace_for_5
		},
		{
			name: '10 km',
			km: 10,
			time: userStats.best_times.time_for_10,
			pace: userStats.best_times.pace_for_10
		},
		{
			name: '21.1 km',
			km: 21.0975,
			time: userStats.best_times.time_for_half_marathon,
			pace: userStats.best_times.pace_for_half_marathon
		},
		{
			name: '42.2 km',
			km: 42.195,
			time: userStats.best_times.time_for_marathon,
			pace: userStats.best_times.pace_for_marathon
		}
	]);

	/**
	 * The four rows are one fitness estimate rendered four times: they lie on a
	 * single Riegel curve, `T = a * D^e`, to within a second of each other. So
	 * the block already answers every distance in between, not just the four it
	 * prints — reading the curve back out of it is the whole slider.
	 *
	 * Read from the account's own predictions rather than from the constant,
	 * because a slider that contradicted the table above it would be worse than
	 * no slider: whatever exponent these four turn out to follow, the two agree.
	 *
	 * The goal prediction is deliberately left out. Its distance is not recorded,
	 * only inferred from a pace stored to the whole second and then rounded to
	 * the half kilometre, so on a long goal it lands over a percent off — a point
	 * in the wrong place, bending the curve around it.
	 */
	const curve = $derived(
		riegelCurve(races.map((r) => ({ km: r.km, seconds: timeStringToSeconds(r.time) })))
	);

	/** The range the four rows state, and so the range the curve is interpolating over. */
	const STATED_FROM_KM = 5;
	const STATED_TO_KM = 42.195;

	const MIN_KM = 1;
	const MAX_KM = 50;

	/** Distances the slider lands on exactly, so the readout can be held against the table. */
	const SNAP_KM = [5, 10, 15, 21.0975, 30, 42.195];

	/** How near a marquee distance counts as being on it, in km. */
	const SNAP_TOLERANCE_KM = 0.25;

	let rawKm = $state(10);

	const distanceKm = $derived(
		SNAP_KM.find((d) => Math.abs(rawKm - d) <= SNAP_TOLERANCE_KM) ?? rawKm
	);

	const predictedSeconds = $derived(curve ? curve(distanceKm) : null);

	const extrapolating = $derived(distanceKm < STATED_FROM_KM || distanceKm > STATED_TO_KM);

	const distanceLabel = $derived(
		Number.isInteger(distanceKm) ? `${distanceKm} km` : `${distanceKm.toFixed(1)} km`
	);

	/** Where a distance sits along the track, as a percentage. */
	function trackPosition(km: number): number {
		return ((km - MIN_KM) / (MAX_KM - MIN_KM)) * 100;
	}

	const ticks = [
		{ km: 5, label: '5' },
		{ km: 10, label: '10' },
		{ km: 21.0975, label: '21.1' },
		{ km: 42.195, label: '42.2' }
	];
</script>

<div class="rounded-lg border border-border bg-card shadow-sm p-6">
	<div class="flex items-center gap-3 mb-4">
		<Timer class="h-6 w-6 text-primary" />
		<h2 class="text-xl font-semibold text-card-foreground">Race Predictions</h2>
	</div>

	<p class="text-sm text-muted-foreground mb-4">
		Predicted race times based on your current fitness level.
	</p>

	<div class="overflow-hidden rounded-md border border-border">
		<table class="w-full text-sm">
			<thead>
				<tr class="border-b border-border bg-muted/50">
					<th class="px-4 py-2.5 text-left font-medium text-muted-foreground">Distance</th>
					<th class="px-4 py-2.5 text-left font-medium text-muted-foreground">Time</th>
					<th class="px-4 py-2.5 text-left font-medium text-muted-foreground">
						Pace ({userStats.best_times.pace_unit})
					</th>
				</tr>
			</thead>
			<tbody>
				{#each races as race, i (race.km)}
					<!-- A row the account has no prediction for yet reads as absent
					     rather than as an empty cell, which is indistinguishable from
					     a column that failed to render. -->
					<tr class={i < races.length - 1 ? 'border-b border-border' : ''}>
						<td class="px-4 py-2.5 font-medium text-card-foreground">{race.name}</td>
						<td class="px-4 py-2.5 text-card-foreground">{race.time || NO_VALUE}</td>
						<td class="px-4 py-2.5 text-card-foreground">{race.pace || NO_VALUE}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	{#if curve && predictedSeconds !== null}
		<div class="mt-6 border-t border-border pt-5" data-testid="any-distance">
			<div class="mb-3 flex items-baseline justify-between gap-3">
				<label for="prediction-distance" class="text-sm font-medium text-card-foreground">
					Any distance
				</label>
				<span class="text-sm text-muted-foreground">{distanceLabel}</span>
			</div>

			<div class="mb-4 flex items-baseline gap-3">
				<span class="text-3xl font-semibold tabular-nums text-card-foreground">
					{secondsToDuration(predictedSeconds)}
				</span>
				<span class="text-sm text-muted-foreground tabular-nums">
					{secondsToPaceString(predictedSeconds / distanceKm)}
					{userStats.best_times.pace_unit}
				</span>
			</div>

			<div class="relative">
				<input
					id="prediction-distance"
					type="range"
					min={MIN_KM}
					max={MAX_KM}
					step="0.1"
					bind:value={rawKm}
					aria-valuetext="{distanceLabel}, {secondsToDuration(predictedSeconds)}"
					class="distance-slider w-full h-2 cursor-pointer appearance-none rounded-full"
				/>
				<div class="relative mt-1.5 h-4">
					{#each ticks as tick (tick.km)}
						<button
							type="button"
							class="absolute -translate-x-1/2 text-xs transition-colors {Math.abs(
								distanceKm - tick.km
							) < 0.05
								? 'font-semibold text-primary'
								: 'text-muted-foreground hover:text-card-foreground'}"
							style="left: {trackPosition(tick.km)}%"
							onclick={() => (rawKm = tick.km)}
						>
							{tick.label}
						</button>
					{/each}
				</div>
			</div>

			<p class="mt-3 text-xs text-muted-foreground">
				{#if extrapolating}
					Outside the {STATED_FROM_KM}–42.2 km your predictions cover — the same curve, carried past
					the distances it was read from.
				{:else}
					The curve your four predictions above already sit on, read at any distance.
				{/if}
			</p>
		</div>
	{/if}
</div>

<style>
	/* Track */
	.distance-slider::-webkit-slider-runnable-track {
		height: 8px;
		border-radius: 9999px;
		background: color-mix(in srgb, var(--color-primary) 25%, transparent);
	}
	.distance-slider::-moz-range-track {
		height: 8px;
		border-radius: 9999px;
		background: color-mix(in srgb, var(--color-primary) 25%, transparent);
	}

	/* Thumb */
	.distance-slider::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		width: 20px;
		height: 20px;
		border-radius: 50%;
		background: var(--color-primary);
		border: 2px solid var(--color-card);
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
		margin-top: -6px;
		cursor: pointer;
	}
	.distance-slider::-moz-range-thumb {
		width: 20px;
		height: 20px;
		border-radius: 50%;
		background: var(--color-primary);
		border: 2px solid var(--color-card);
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
		cursor: pointer;
	}
</style>
