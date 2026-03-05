<script lang="ts">
	import { getContext } from 'svelte';
	import type { CalendarStore } from '$lib/stores/calendar.svelte';
	import CalendarCell from './calendar-cell.svelte';

	const store = getContext<CalendarStore>('calendar');

	const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
</script>

<div class="grid grid-cols-7 gap-1">
	{#each DAY_NAMES as dayName}
		<div class="py-1 text-center text-xs font-medium text-muted-foreground">
			{dayName}
		</div>
	{/each}

	{#each store.monthData.daysInMonthWithOffset as day (day)}
		<CalendarCell {day} />
	{/each}
</div>
