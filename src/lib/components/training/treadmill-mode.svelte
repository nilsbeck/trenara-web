<script lang="ts">
	import type { ScheduledTraining } from '$lib/server/trenara/types';
	import { X, ChevronUp, ChevronDown } from 'lucide-svelte';
	import TreadmillIcon from '$lib/components/icons/treadmill-icon.svelte';
	import { buildTreadmillInstructions } from '$lib/utils/treadmill-instructions';
	import { blockTypeColor } from '$lib/utils/block-color';

	let { training }: { training: ScheduledTraining } = $props();

	let dialogEl: HTMLDialogElement | undefined = $state();
	let currentIndex = $state(0);

	const instructions = $derived(buildTreadmillInstructions(training));
	const total = $derived(instructions.length);
	const current = $derived(instructions[currentIndex]);
	const isFirst = $derived(currentIndex === 0);
	const isLast = $derived(currentIndex >= total - 1);

	function open() {
		currentIndex = 0;
		dialogEl?.showModal();
	}

	function close() {
		dialogEl?.close();
	}

	function goPrevious() {
		if (!isFirst) currentIndex -= 1;
	}

	function goNext() {
		if (!isLast) currentIndex += 1;
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
			e.preventDefault();
			goPrevious();
		} else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
			e.preventDefault();
			goNext();
		}
		// Esc is handled natively by <dialog>
	}
</script>

<!-- Mobile-only trigger, shown next to the training title -->
<button
	type="button"
	onclick={open}
	class="md:hidden shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-primary transition-colors"
	aria-label="Start treadmill mode"
>
	<TreadmillIcon class="h-4 w-4" />
</button>

<dialog
	bind:this={dialogEl}
	onkeydown={handleKeydown}
	class="fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none rounded-none border-0 bg-background p-0 text-foreground backdrop:bg-black/90"
>
	<div class="flex h-full flex-col">
		<!-- Header -->
		<div class="flex items-center justify-between border-b border-border px-4 py-3">
			<div class="min-w-0">
				<p class="truncate text-sm font-medium text-foreground">{training.title}</p>
				{#if current}
					<p class="text-xs text-muted-foreground">
						Step {currentIndex + 1} of {total}
						{#if current.repeatIndex}
							· Rep {current.repeatIndex}/{current.repeatTotal}
						{/if}
					</p>
				{/if}
			</div>
			<button
				type="button"
				onclick={close}
				class="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
				aria-label="Exit treadmill mode"
			>
				<X class="h-6 w-6" />
			</button>
		</div>

		{#if current}
			<!-- Previous -->
			<button
				type="button"
				onclick={goPrevious}
				disabled={isFirst}
				class="flex items-center justify-center gap-1 py-3 text-sm font-medium text-muted-foreground transition-colors disabled:opacity-30 enabled:hover:bg-muted"
				aria-label="Previous instruction"
			>
				<ChevronUp class="h-5 w-5" />
				Previous
			</button>

			<!-- Current instruction -->
			<div
				class="flex flex-1 flex-col items-center justify-center gap-4 overflow-y-auto px-6 py-4 text-center"
			>
				<div
					class="h-1.5 w-16 rounded-full"
					style="background-color: {blockTypeColor(current.type)}"
				></div>

				{#if current.groupLabel}
					<p class="text-sm font-medium text-muted-foreground">{current.groupLabel}</p>
				{/if}

				<p class="text-2xl font-semibold leading-snug text-foreground">
					{current.title}
				</p>

				{#if current.speedLabel}
					<p class="text-5xl font-bold tabular-nums text-primary">{current.speedLabel}</p>
				{/if}

				{#if current.distance || current.time}
					<div class="flex gap-4 text-sm text-muted-foreground">
						{#if current.distance}<span>{current.distance}</span>{/if}
						{#if current.time}<span>{current.time}</span>{/if}
					</div>
				{/if}
			</div>

			<!-- Next -->
			<button
				type="button"
				onclick={goNext}
				disabled={isLast}
				class="flex items-center justify-center gap-1 bg-primary py-4 text-sm font-medium text-primary-foreground transition-colors disabled:bg-muted disabled:text-muted-foreground disabled:opacity-60"
				aria-label="Next instruction"
			>
				Next
				<ChevronDown class="h-5 w-5" />
			</button>
		{:else}
			<div class="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
				<p class="text-sm text-muted-foreground">No instructions available for this training.</p>
			</div>
		{/if}
	</div>
</dialog>
