<script lang="ts">
	import type { TrainingBlock } from '$lib/server/trenara/types';
	import CooldownBlock from '$lib/components/training/cooldown-block.svelte';
	import TurnaroundMarker from '$lib/components/training/turnaround-marker.svelte';
	import { blockTypeColor } from '$lib/utils/block-color';
	import { describeTurnaround, type Turnaround } from '$lib/utils/turnaround';

	let {
		blocks,
		cooldownIndex,
		cooldownNeedsOwnRow,
		cooldownRemoved,
		cooldownPending,
		onCooldownChange,
		turnaround = null
	}: {
		blocks: TrainingBlock[];
		/** The block that is the cool-down control, or -1 where none is. */
		cooldownIndex: number;
		/** The cool-down is on but its block could not be pointed at. */
		cooldownNeedsOwnRow: boolean;
		/** The cool-down has been dropped, so the plan shows what is gone. */
		cooldownRemoved: boolean;
		cooldownPending: boolean;
		onCooldownChange: (next: boolean) => void;
		/** Where to turn on an out-and-back, drawn after the step it falls in. */
		turnaround?: Turnaround | null;
	} = $props();

	const turnText = $derived(turnaround ? describeTurnaround(turnaround) : null);

	/** Whether the turn marker goes straight after this step. */
	function turnsAfter(blockIndex: number, subIndex: number | null): boolean {
		return (
			turnaround !== null &&
			turnaround.exact.blockIndex === blockIndex &&
			turnaround.exact.subIndex === subIndex
		);
	}
</script>

<!--
	The coach's plan for the session, block by block. Drawn from whichever copy
	of the training the card holds; every decision about the cool-down is made
	by the card and handed in, since it is the card's store that changes it.
-->
<div class="flex flex-col gap-3">
	<h4 class="text-sm font-medium text-foreground">Training details</h4>
	{#each blocks as block, blockIndex (blockIndex)}
		{#if block.blocks && block.blocks.length > 0}
			<!-- Composite block (intervals / repeat sets) -->
			<div class="flex flex-col gap-1.5">
				<!-- Header row: split-colour circle + label -->
				<div class="flex items-center gap-2.5">
					<div class="relative h-4 w-4 shrink-0 overflow-hidden rounded-full">
						<div
							class="absolute inset-0 right-1/2"
							style="background-color: {blockTypeColor(block.blocks[0]?.type)}"
						></div>
						<div
							class="absolute inset-0 left-1/2"
							style="background-color: {blockTypeColor(
								block.blocks[block.blocks.length - 1]?.type
							)}"
						></div>
					</div>
					<span class="text-sm font-medium text-foreground">
						{#if block.text}
							{block.text}{#if block.repeat && block.repeat > 1}&nbsp;×{block.repeat}{/if}
						{:else}
							Block{#if block.repeat && block.repeat > 1}
								×{block.repeat}{/if}:
						{/if}
					</span>
				</div>
				<!-- Sub-blocks with coloured vertical bar -->
				<div class="ml-[26px] flex flex-col gap-1">
					{#each block.blocks as sub, subIndex (subIndex)}
						<div class="flex items-start gap-2 text-sm">
							<div
								class="mt-[4px] w-[3px] shrink-0 self-stretch rounded-full"
								style="background-color: {blockTypeColor(sub.type)}; min-height: 12px"
							></div>
							<span class="leading-snug text-foreground">{sub.text}</span>
						</div>
						{#if turnText && turnsAfter(blockIndex, subIndex)}
							<TurnaroundMarker text={turnText} />
						{/if}
					{/each}
				</div>
			</div>
		{:else if blockIndex === cooldownIndex}
			<CooldownBlock
				hasCooldown={true}
				text={block.text ?? 'Cool-down'}
				color={blockTypeColor(block.type)}
				pending={cooldownPending}
				onchange={onCooldownChange}
			/>
		{:else}
			<!-- Simple block: solid circle + text -->
			<div class="flex items-center gap-2.5 text-sm">
				<div
					class="h-4 w-4 shrink-0 rounded-full"
					style="background-color: {blockTypeColor(block.type)}"
				></div>
				<span class="text-foreground">{block.text}</span>
			</div>
		{/if}
		{#if turnText && turnsAfter(blockIndex, null)}
			<TurnaroundMarker text={turnText} />
		{/if}
	{/each}

	{#if cooldownNeedsOwnRow}
		<!-- The session has a cool-down but did not name its block in a
		     way we recognise, so the control gets a row of its own rather
		     than being attached to whichever block happens to be last. -->
		<CooldownBlock
			hasCooldown={true}
			text="Cool-down"
			color={blockTypeColor('cooldown')}
			pending={cooldownPending}
			onchange={onCooldownChange}
		/>
	{/if}

	{#if cooldownRemoved}
		<!-- Removed, the cool-down stays in place as a ghost: the plan shows
		     what is missing and offers it straight back. -->
		<CooldownBlock
			hasCooldown={false}
			text="Cool-down removed"
			color={blockTypeColor('cooldown')}
			pending={cooldownPending}
			onchange={onCooldownChange}
		/>
	{/if}
</div>
