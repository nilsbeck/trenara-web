<script lang="ts">
	import type { ScheduledTraining } from '$lib/server/trenara/types';
	import { X, ChevronUp, ChevronDown, Flag } from 'lucide-svelte';
	import TreadmillIcon from '$lib/components/icons/treadmill-icon.svelte';
	import {
		buildTreadmillInstructions,
		type TreadmillInstruction
	} from '$lib/utils/treadmill-instructions';
	import { blockTypeColor } from '$lib/utils/block-color';

	let { training }: { training: ScheduledTraining } = $props();

	let dialogEl: HTMLDialogElement | undefined = $state();
	// A closed <dialog> keeps its contents in the DOM, so the steps would shadow
	// the ones in the training detail list behind it. Only mount them once open.
	let isOpen = $state(false);
	let currentIndex = $state(0);

	const instructions = $derived(buildTreadmillInstructions(training));
	const total = $derived(instructions.length);
	const isFirst = $derived(currentIndex === 0);
	const isLast = $derived(currentIndex >= total - 1);

	type PaneRole = 'previous' | 'now' | 'next';
	const roleLabel: Record<PaneRole, string> = {
		previous: 'Done',
		now: 'Now',
		next: 'Next'
	};

	// Two adjacent steps are on screen at all times: the one being run and the
	// one after it. The final step has no "next", so it slides down into the
	// bottom slot and the step before it fills the top — the runner still gets
	// a pair, and the active half is always the highlighted one.
	const activeAtBottom = $derived(isLast && total > 1);
	const topStep = $derived(instructions[activeAtBottom ? currentIndex - 1 : currentIndex]);
	const bottomStep = $derived(instructions[activeAtBottom ? currentIndex : currentIndex + 1]);
	const topRole = $derived<PaneRole>(activeAtBottom ? 'previous' : 'now');
	const bottomRole = $derived<PaneRole>(activeAtBottom ? 'now' : 'next');

	function open() {
		currentIndex = 0;
		resetDrag();
		isOpen = true;
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

	// ── Swipe ─────────────────────────────────────────────────
	// Swipe up to advance, down to go back — the same direction the step list
	// itself moves. Pointer events cover both touch and a mouse drag.
	const SWIPE_THRESHOLD = 56;
	const MAX_DRAG = 90;

	let dragging = $state(false);
	let dragOffset = $state(0);
	let dragStartY = 0;
	let activePointer: number | null = null;

	function resetDrag() {
		dragging = false;
		dragOffset = 0;
		activePointer = null;
	}

	function onPointerDown(e: PointerEvent) {
		if (e.pointerType === 'mouse' && e.button !== 0) return;
		activePointer = e.pointerId;
		dragStartY = e.clientY;
		dragging = true;
		dragOffset = 0;
		(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
	}

	function onPointerMove(e: PointerEvent) {
		if (!dragging || e.pointerId !== activePointer) return;
		const travelled = e.clientY - dragStartY;
		// Dampen the follow, and dampen it harder when there's nowhere to go —
		// the panel still gives, so the gesture registers, but it reads as a wall.
		const blocked = (travelled < 0 && isLast) || (travelled > 0 && isFirst);
		const damped = travelled * (blocked ? 0.15 : 0.4);
		dragOffset = Math.max(-MAX_DRAG, Math.min(MAX_DRAG, damped));
	}

	function onPointerUp(e: PointerEvent) {
		if (!dragging || e.pointerId !== activePointer) return;
		const travelled = e.clientY - dragStartY;
		resetDrag();
		if (travelled <= -SWIPE_THRESHOLD) goNext();
		else if (travelled >= SWIPE_THRESHOLD) goPrevious();
	}
</script>

{#snippet pane(step: TreadmillInstruction, role: PaneRole)}
	{@const active = role === 'now'}
	<div
		data-testid="treadmill-pane"
		data-pane-role={role}
		class="flex flex-1 basis-0 flex-col justify-center gap-1.5 overflow-hidden px-5 py-4 {active
			? 'bg-muted/40'
			: 'opacity-55'}"
		style="border-left: 4px solid {blockTypeColor(step.type)}"
	>
		<div class="flex min-w-0 items-center gap-2">
			<span
				class="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide {active
					? 'bg-primary text-primary-foreground'
					: 'bg-muted text-muted-foreground'}"
			>
				{roleLabel[role]}
			</span>
			<h2 class="truncate text-sm font-medium text-foreground">
				{step.title}
				{#if step.repeatIndex}
					· Rep {step.repeatIndex}/{step.repeatTotal}
				{/if}
			</h2>
		</div>

		{#if step.speedLabel}
			<p
				class="font-bold leading-none tabular-nums text-primary {active ? 'text-5xl' : 'text-2xl'}"
			>
				{step.speedLabel}
			</p>
		{/if}

		{#if step.cumulativeDistanceLabel}
			<p
				class="font-semibold leading-none tabular-nums text-foreground {active
					? 'text-4xl'
					: 'text-2xl'}"
			>
				<span class="text-sm font-normal text-muted-foreground">Total</span>
				{step.cumulativeDistanceLabel}
			</p>
		{/if}

		<p class="truncate text-xs text-muted-foreground">
			{#if step.groupLabel}{step.groupLabel} ·{/if}
			{#if step.distance}Step {step.distance}{/if}
			{#if step.distance && step.time}
				·
			{/if}
			{#if step.time}{step.time} min{/if}
		</p>
	</div>
{/snippet}

{#snippet finishPane()}
	<div
		class="flex flex-1 basis-0 flex-col items-center justify-center gap-2 border-l-4 border-border px-5 py-4 opacity-55"
	>
		<Flag class="h-6 w-6 text-muted-foreground" />
		<p class="text-sm font-medium text-muted-foreground">End of session</p>
	</div>
{/snippet}

<!-- Mobile-only trigger, shown next to the training title -->
<button
	type="button"
	onclick={open}
	class="md:hidden shrink-0 rounded-md p-2.5 text-muted-foreground hover:bg-muted hover:text-primary transition-colors"
	aria-label="Start treadmill mode"
>
	<TreadmillIcon class="h-5 w-5" />
</button>

<dialog
	bind:this={dialogEl}
	onkeydown={handleKeydown}
	onclose={() => (isOpen = false)}
	class="fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none rounded-none border-0 bg-background p-0 text-foreground backdrop:bg-black/90"
>
	{#if isOpen}
		<div class="flex h-full flex-col">
			<!-- Header -->
			<div class="flex items-center justify-between border-b border-border px-4 py-3">
				<div class="min-w-0">
					<p class="truncate text-sm font-medium text-foreground">{training.title}</p>
					{#if total > 0}
						<p class="text-xs text-muted-foreground">
							Step {currentIndex + 1} of {total} · swipe to change
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

			{#if topStep}
				<!-- Progress -->
				<div class="h-1 w-full bg-muted">
					<div
						class="h-full bg-primary transition-[width] duration-200"
						style="width: {((currentIndex + 1) / total) * 100}%"
					></div>
				</div>

				<!-- Split view: current step over the next one -->
				<div
					class="flex-1 touch-none select-none overflow-hidden"
					role="group"
					aria-label="Training steps — swipe up for the next step, down for the previous"
					onpointerdown={onPointerDown}
					onpointermove={onPointerMove}
					onpointerup={onPointerUp}
					onpointercancel={resetDrag}
					data-testid="treadmill-swipe-area"
				>
					<div
						class="flex h-full flex-col divide-y divide-border {dragging
							? ''
							: 'transition-transform duration-200'}"
						style="transform: translateY({dragOffset}px)"
					>
						{@render pane(topStep, topRole)}
						{#if bottomStep}
							{@render pane(bottomStep, bottomRole)}
						{:else}
							{@render finishPane()}
						{/if}
					</div>
				</div>

				<!-- Controls -->
				<div class="grid grid-cols-2 gap-px border-t border-border bg-border">
					<button
						type="button"
						onclick={goPrevious}
						disabled={isFirst}
						class="flex items-center justify-center gap-1 bg-background py-4 text-sm font-medium text-muted-foreground transition-colors disabled:opacity-30 enabled:hover:bg-muted"
						aria-label="Previous instruction"
					>
						<ChevronUp class="h-5 w-5" />
						Previous
					</button>
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
				</div>
			{:else}
				<div class="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
					<p class="text-sm text-muted-foreground">No instructions available for this training.</p>
				</div>
			{/if}
		</div>
	{/if}
</dialog>
