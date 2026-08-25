<script lang="ts">
	import { getContext } from 'svelte';
	import type { CalendarStore } from '$lib/stores/calendar.svelte';
	import { planWeekBand, planWeekFor, type PlanWeeks } from '$lib/utils/plan-weeks';
	import CalendarCell from './calendar-cell.svelte';
	import WeekBand from './week-band.svelte';

	let { planWeeks = null }: { planWeeks?: PlanWeeks | null } = $props();

	const store = getContext<CalendarStore>('calendar');

	const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

	/**
	 * The month's cells cut into calendar rows, each with the week it belongs to.
	 *
	 * The grid is Monday-first with a leading offset, so a plain slice of seven
	 * is a real week. The row's first cell dates the week — including when that
	 * lands in the previous month, which `Date` rolls back for us.
	 */
	const rows = $derived.by(() => {
		const { daysInMonthWithOffset, offsetAtStart } = store.monthData;
		const year = store.currentDate.getFullYear();
		const month = store.currentDate.getMonth();
		const out: { days: number[]; band: ReturnType<typeof planWeekBand> }[] = [];

		for (let i = 0; i < daysInMonthWithOffset.length; i += 7) {
			const days = daysInMonthWithOffset.slice(i, i + 7);
			const monday = new Date(year, month, days[0] - offsetAtStart);
			const week = planWeeks ? planWeekFor(planWeeks, monday) : null;
			out.push({ days, band: week ? planWeekBand(week) : null });
		}

		return out;
	});
</script>

<div class="grid grid-cols-7 gap-1">
	{#each DAY_NAMES as dayName}
		<div class="py-1 text-center text-xs font-medium text-muted-foreground">
			{dayName}
		</div>
	{/each}

	{#each rows as row, i (i)}
		<!-- Nothing at all for an ordinary week, and nothing outside the plan. -->
		{#if row.band}
			<WeekBand band={row.band} />
		{/if}
		{#each row.days as day (day)}
			<CalendarCell {day} />
		{/each}
	{/each}
</div>
