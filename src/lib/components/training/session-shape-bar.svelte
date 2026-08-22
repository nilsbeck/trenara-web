<script lang="ts">
	import type { ScheduledTraining } from '$lib/server/trenara/types';
	import { shapeSegments } from '$lib/utils/session-setup';

	let { training }: { training: ScheduledTraining } = $props();

	const segments = $derived(shapeSegments(training));
</script>

<!--
	The session's shape in one line: a solid slab is a tempo, a comb of thin
	marks is intervals or strides. It reads before the title does, and unlike a
	per-workout-type icon it cannot be wrong — the blocks are the blocks.
-->
{#if segments.length > 0}
	<div class="mt-2 flex h-1.5 gap-px overflow-hidden rounded-full" aria-hidden="true">
		{#each segments as segment, i (i)}
			<span
				class="block h-full rounded-[1px]"
				style="flex: {segment.weight}; background-color: {segment.color}"
			></span>
		{/each}
	</div>
{/if}
