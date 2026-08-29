<script lang="ts">
	import { getContext } from 'svelte';
	import type { CalendarDate, CalendarStore } from '$lib/stores/calendar.svelte';

	// `null` is a filler cell: the days before the 1st in the month grid, and the
	// nothing there is to show for them.
	let { date }: { date: CalendarDate | null } = $props();

	const store = getContext<CalendarStore>('calendar');

	const isDay = $derived(date !== null);

	// Read from the store rather than `new Date()`: a tab left open overnight has
	// to move the highlight on at midnight, and only a value that can change will.
	const isToday = $derived.by(() => {
		if (!date) return false;
		const now = store.today;
		return (
			date.year === now.getFullYear() && date.month === now.getMonth() && date.day === now.getDate()
		);
	});

	const isSelected = $derived.by(() => {
		const selected = store.selectedDate;
		if (!date || !selected) return false;
		return (
			selected.year === date.year && selected.month === date.month && selected.day === date.day
		);
	});

	const runStatus = $derived(date ? store.getTrainingStatusForDay(date, 'run') : 'none');

	const strengthStatus = $derived(date ? store.getTrainingStatusForDay(date, 'strength') : 'none');

	function handleClick() {
		if (!date) return;
		void store.selectDay(date);
	}
</script>

<button
	type="button"
	class="relative flex h-10 w-full flex-col items-center justify-center rounded-lg text-sm transition-colors"
	class:cursor-pointer={isDay}
	class:cursor-default={!isDay}
	class:text-foreground={isDay}
	class:text-transparent={!isDay}
	class:bg-calendar-selected={isSelected}
	class:text-white={isSelected}
	class:font-semibold={isSelected || isToday}
	class:bg-calendar-today={isToday && !isSelected}
	class:hover:bg-muted={isDay && !isSelected && !isToday}
	disabled={!isDay}
	onclick={handleClick}
	aria-label={date ? `Select day ${date.day}` : undefined}
>
	{#if date}
		<span class="leading-none">{date.day}</span>
		<div class="mt-0.5 flex gap-0.5">
			{#if runStatus !== 'none'}
				<span
					class="block h-1 w-1 rounded-full"
					class:bg-dot-scheduled={runStatus === 'scheduled'}
					class:bg-dot-completed={runStatus === 'completed'}
					class:bg-dot-missed={runStatus === 'missed'}
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
