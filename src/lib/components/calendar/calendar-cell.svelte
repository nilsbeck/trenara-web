<script lang="ts">
	import { getContext } from 'svelte';
	import type { CalendarStore } from '$lib/stores/calendar.svelte';

	let { day }: { day: number } = $props();

	const store = getContext<CalendarStore>('calendar');

	const actualDay = $derived(day - store.monthData.offsetAtStart);
	const isValidDay = $derived(actualDay > 0);

	// Read from the store rather than `new Date()`: a tab left open overnight has
	// to move the highlight on at midnight, and only a value that can change will.
	const isToday = $derived.by(() => {
		if (!isValidDay) return false;
		const now = store.today;
		return (
			store.currentDate.getFullYear() === now.getFullYear() &&
			store.currentDate.getMonth() === now.getMonth() &&
			actualDay === now.getDate()
		);
	});

	const isSelected = $derived.by(() => {
		if (!isValidDay || !store.selectedDate) return false;
		return (
			store.selectedDate.year === store.currentDate.getFullYear() &&
			store.selectedDate.month === store.currentDate.getMonth() &&
			store.selectedDate.day === actualDay
		);
	});

	const runStatus = $derived(
		isValidDay ? store.getTrainingStatusForDate({ type: 'run', day: actualDay }) : 'none'
	);

	const strengthStatus = $derived(
		isValidDay ? store.getTrainingStatusForDate({ type: 'strength', day: actualDay }) : 'none'
	);

	// The API's own colour for this session, when it sent one. Null falls the dot
	// back to the theme token, which is what a missed session always gets.
	const runColour = $derived(isValidDay ? store.getRunColourForDate(actualDay, runStatus) : null);

	/**
	 * A day behind you is a triangle, a day ahead is a dot.
	 *
	 * Written as inline style rather than an arbitrary Tailwind class: the class
	 * would only ever appear inside a `class:` directive, which is exactly the
	 * shape Tailwind's scanner is least reliable at finding, and a missing
	 * clip-path fails silently as a square.
	 */
	const TRIANGLE = 'clip-path: polygon(50% 0%, 100% 100%, 0% 100%)';

	function markerStyle(status: string, colour: string | null): string | undefined {
		const parts = [];
		if (status !== 'scheduled') parts.push(TRIANGLE);
		if (colour) parts.push(`background-color: ${colour}`);
		return parts.length > 0 ? parts.join('; ') : undefined;
	}

	function handleClick() {
		if (!isValidDay) return;
		store.setSelectedDate({
			year: store.currentDate.getFullYear(),
			month: store.currentDate.getMonth(),
			day: actualDay
		});
	}
</script>

<button
	type="button"
	class="relative flex h-10 w-full flex-col items-center justify-center rounded-lg text-sm transition-colors"
	class:cursor-pointer={isValidDay}
	class:cursor-default={!isValidDay}
	class:text-foreground={isValidDay}
	class:text-transparent={!isValidDay}
	class:bg-calendar-selected={isSelected}
	class:text-white={isSelected}
	class:font-semibold={isSelected || isToday}
	class:bg-calendar-today={isToday && !isSelected}
	class:hover:bg-muted={isValidDay && !isSelected && !isToday}
	disabled={!isValidDay}
	onclick={handleClick}
	aria-label={isValidDay ? `Select day ${actualDay}` : undefined}
>
	{#if isValidDay}
		<span class="leading-none">{actualDay}</span>
		<!--
			Shape says whether the day has happened, colour says what the session is.

			Colour cannot carry both: once a session is drawn in its own colour, an
			intervals session and a missed one are both red. So a day behind you is
			a triangle whether it was run or not, and a day still ahead is a dot —
			a distinction that holds whatever palette the API sends, and one that
			survives a reader who cannot separate two reds.
		-->
		<div class="mt-0.5 flex items-end gap-0.5">
			{#if runStatus !== 'none'}
				<span
					class="block"
					class:h-1={runStatus === 'scheduled'}
					class:w-1={runStatus === 'scheduled'}
					class:rounded-full={runStatus === 'scheduled'}
					class:h-1.5={runStatus !== 'scheduled'}
					class:w-1.5={runStatus !== 'scheduled'}
					class:bg-dot-scheduled={!runColour && runStatus === 'scheduled'}
					class:bg-dot-completed={!runColour && runStatus === 'completed'}
					class:bg-dot-missed={runStatus === 'missed'}
					style={markerStyle(runStatus, runColour)}
				></span>
			{/if}
			{#if strengthStatus !== 'none'}
				<span
					class="block"
					class:h-1={strengthStatus === 'scheduled'}
					class:w-1={strengthStatus === 'scheduled'}
					class:rounded-full={strengthStatus === 'scheduled'}
					class:h-1.5={strengthStatus !== 'scheduled'}
					class:w-1.5={strengthStatus !== 'scheduled'}
					class:bg-dot-scheduled={strengthStatus === 'scheduled'}
					class:bg-dot-completed={strengthStatus === 'completed'}
					class:bg-dot-missed={strengthStatus === 'missed'}
					style={markerStyle(strengthStatus, null)}
				></span>
			{/if}
		</div>
	{/if}
</button>
