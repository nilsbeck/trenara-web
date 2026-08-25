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
		<div class="mt-0.5 flex gap-0.5">
			{#if runStatus !== 'none'}
				<span
					class="block h-1 w-1 rounded-full"
					class:bg-dot-scheduled={!runColour && runStatus === 'scheduled'}
					class:bg-dot-completed={!runColour && runStatus === 'completed'}
					class:bg-dot-missed={runStatus === 'missed'}
					style={runColour ? `background-color: ${runColour}` : undefined}
				></span>
			{/if}
			{#if strengthStatus !== 'none'}
				<span
					class="block h-1 w-1 rounded-full"
					class:bg-dot-scheduled={strengthStatus === 'scheduled'}
					class:bg-dot-completed={strengthStatus === 'completed'}
					class:bg-dot-missed={strengthStatus === 'missed'}
				></span>
			{/if}
		</div>
	{/if}
</button>
