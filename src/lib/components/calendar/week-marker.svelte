<script lang="ts">
	import type { PlanWeekBand } from '$lib/utils/plan-weeks';

	let { band }: { band: PlanWeekBand } = $props();

	/**
	 * Hard at the top of the scale, easy at the bottom — the reading a runner
	 * already has for these colours, so the bar says something before the label
	 * is read.
	 */
	const COLOURS: Record<string, string> = {
		'Peak week': 'bg-red-500/80',
		'Build week': 'bg-amber-500/80',
		'Recovery week': 'bg-emerald-500/80',
		Taper: 'bg-sky-500/80'
	};

	const summary = $derived(
		band.action ? `${band.label} — ${band.action}. ${band.note}.` : `${band.label}. ${band.note}.`
	);
</script>

<!--
	A week's character as a stripe beside its row.

	Deliberately silent: the grid is four hundred pixels wide and a line of text
	per week buried it. The colour is the whole signal at a glance, and the words
	are there on hover for the one week someone actually wants to know about.
-->
<div class="flex items-center justify-center py-0.5" title={summary}>
	<span
		class="block h-full w-1 rounded-full {COLOURS[band.label] ?? 'bg-muted-foreground/50'}"
		role="img"
		aria-label={summary}
	></span>
</div>
