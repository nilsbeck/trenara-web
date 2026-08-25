<script lang="ts">
	import { ArrowUp, Feather } from 'lucide-svelte';
	import type { PlanWeekBand } from '$lib/utils/plan-weeks';

	let { band }: { band: PlanWeekBand } = $props();
</script>

<!--
	What this week of the plan is for, above the row it belongs to.

	Read off the volume curve, not sent by the API, which is why it reads as an
	observation rather than an instruction from the coach. The direction is the
	point: a build week is missed by doing too little and a recovery week by
	doing too much, so the two are drawn apart rather than alike.
-->
<div
	class="col-span-7 mt-1 flex items-center gap-1.5 px-1 text-[10px] leading-tight"
	class:text-primary={band.direction === 'complete'}
	class:text-muted-foreground={band.direction !== 'complete'}
>
	{#if band.direction === 'complete'}
		<ArrowUp class="h-3 w-3 flex-shrink-0" />
	{:else}
		<Feather class="h-3 w-3 flex-shrink-0" />
	{/if}
	<span class="font-semibold uppercase tracking-wider">{band.label}</span>
	{#if band.action}
		<span class="opacity-80">· {band.action}</span>
	{/if}
	<span class="ml-auto truncate opacity-70">{band.note}</span>
</div>
