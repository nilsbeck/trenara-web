<script lang="ts">
	import { getContext } from 'svelte';
	import type { CalendarDate, CalendarStore } from '$lib/stores/calendar.svelte';
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
</script>

<div class="grid grid-cols-7 gap-1" id="calendar-grid">
	{#each DAY_NAMES as dayName}
		<div class="py-1 text-center text-xs font-medium text-muted-foreground">
			{dayName}
		</div>
	{/each}

	{#each cells as cell, i (cellKey(cell, i))}
		<CalendarCell date={cell} />
	{/each}
</div>
