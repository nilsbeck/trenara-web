<script lang="ts">
	import { getContext } from 'svelte';
	import type { CalendarDate, CalendarStore } from '$lib/stores/calendar.svelte';
	import { followOffset, isHorizontalSwipe, swipeStep } from '$lib/utils/swipe';
	import CalendarCell from './calendar-cell.svelte';

	const store = getContext<CalendarStore>('calendar');

	const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

	// One list of cells either way, so the grid itself does not care whether it
	// is showing a month or the single week folded out of it. A month keeps its
	// leading blanks; a week is seven real days, whichever months they fall in.
	const cells = $derived.by<(CalendarDate | null)[]>(() => {
		if (store.viewMode === 'week') return store.weekDays;

		const year = store.currentDate.getFullYear();
		const month = store.currentDate.getMonth();
		const { daysInMonthWithOffset, offsetAtStart } = store.monthData;

		return daysInMonthWithOffset.map((slot) => {
			const day = slot - offsetAtStart;
			return day > 0 ? { year, month, day } : null;
		});
	});

	function cellKey(cell: CalendarDate | null, index: number): string {
		return cell ? `${cell.year}-${cell.month}-${cell.day}` : `blank-${index}`;
	}

	/**
	 * What the grid is currently showing, as one value that changes exactly when
	 * the days on screen do. Keying the rows on it makes Svelte build a fresh
	 * set every time the period moves, which is what starts the slide.
	 */
	const periodKey = $derived.by(() => {
		if (store.viewMode === 'week') {
			const monday = store.weekDays[0];
			return `week-${monday.year}-${monday.month}-${monday.day}`;
		}
		return `month-${store.currentDate.getFullYear()}-${store.currentDate.getMonth()}`;
	});

	// A step forward brings the new period in from the right, a step back from
	// the left; a fold or the opening render is neither, and just appears.
	const direction = $derived(store.navigationDirection);

	const swipeHint = $derived(
		store.viewMode === 'week'
			? 'Calendar days — swipe sideways to change week'
			: 'Calendar days — swipe sideways to change month'
	);

	// ── Swipe ─────────────────────────────────────────────────
	// Drag the grid sideways to step through it — left for the next period,
	// right for the previous, at whatever size the view is showing. Pointer
	// events so a mouse drag works the same way a thumb does.

	let dragOffset = $state(0);
	let swiping = $state(false);

	let pressed = false;
	let startX = 0;
	let startY = 0;
	let activePointer: number | null = null;
	// A gesture that turned into a swipe still ends with a click on whichever
	// cell it started over. That click is the tail of the swipe, not a pick.
	let swallowClick = false;

	function endGesture() {
		pressed = false;
		swiping = false;
		dragOffset = 0;
		activePointer = null;
	}

	function onPointerDown(event: PointerEvent) {
		if (event.pointerType === 'mouse' && event.button !== 0) return;
		// Every click arrives behind a press, so clearing the flag here is what
		// keeps a swallowed click from ever outliving its own gesture.
		swallowClick = false;
		if (store.isLoading) return;

		activePointer = event.pointerId;
		startX = event.clientX;
		startY = event.clientY;
		pressed = true;
		swiping = false;
		dragOffset = 0;
	}

	function onPointerMove(event: PointerEvent) {
		if (!pressed || event.pointerId !== activePointer) return;

		const dx = event.clientX - startX;
		const dy = event.clientY - startY;

		if (!swiping) {
			// Until the movement has committed to the horizontal, it may still be
			// the runner scrolling the page — so leave it alone.
			if (!isHorizontalSwipe(dx, dy)) return;
			swiping = true;
			(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
		}

		dragOffset = followOffset(dx);
	}

	function onPointerUp(event: PointerEvent) {
		if (!pressed || event.pointerId !== activePointer) return;

		const dx = event.clientX - startX;
		const step = swiping ? swipeStep(dx) : null;
		swallowClick = swiping;
		endGesture();

		if (step === 'next') void store.navigation.goToNext();
		else if (step === 'previous') void store.navigation.goToPrevious();
	}

	function onClickCapture(event: MouseEvent) {
		if (!swallowClick) return;
		swallowClick = false;
		event.preventDefault();
		event.stopPropagation();
	}
</script>

<!--
	`touch-action: pan-y` rather than `none`: the calendar sits partway down a
	page that has to keep scrolling under the same thumb. Sideways is the grid's,
	up and down stays the page's.
-->
<div
	class="touch-pan-y select-none overflow-hidden"
	id="calendar-grid"
	role="group"
	aria-label={swipeHint}
	onpointerdown={onPointerDown}
	onpointermove={onPointerMove}
	onpointerup={onPointerUp}
	onpointercancel={endGesture}
	onclickcapture={onClickCapture}
>
	<div class="mb-1 grid grid-cols-7 gap-1">
		{#each DAY_NAMES as dayName}
			<div class="py-1 text-center text-xs font-medium text-muted-foreground">
				{dayName}
			</div>
		{/each}
	</div>

	<!-- The finger's own travel, damped. Eased back only once it is let go. -->
	<div
		class={swiping ? 'will-change-transform' : 'transition-transform duration-200 ease-out'}
		style="transform: translateX({dragOffset}px)"
	>
		{#key periodKey}
			<div
				class="grid grid-cols-7 gap-1"
				class:slide-from-right={direction === 1}
				class:slide-from-left={direction === -1}
			>
				{#each cells as cell, i (cellKey(cell, i))}
					<CalendarCell date={cell} />
				{/each}
			</div>
		{/key}
	</div>
</div>

<style>
	@keyframes slide-in-right {
		from {
			transform: translateX(24%);
			opacity: 0;
		}
		to {
			transform: translateX(0);
			opacity: 1;
		}
	}

	@keyframes slide-in-left {
		from {
			transform: translateX(-24%);
			opacity: 0;
		}
		to {
			transform: translateX(0);
			opacity: 1;
		}
	}

	.slide-from-right {
		animation: slide-in-right 220ms cubic-bezier(0.22, 1, 0.36, 1);
	}

	.slide-from-left {
		animation: slide-in-left 220ms cubic-bezier(0.22, 1, 0.36, 1);
	}

	/* Motion here is decoration on top of a move that has already happened. */
	@media (prefers-reduced-motion: reduce) {
		.slide-from-right,
		.slide-from-left {
			animation: none;
		}
	}
</style>
