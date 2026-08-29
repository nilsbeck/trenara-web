<script lang="ts">
	import { getContext } from 'svelte';
	import type { CalendarStore } from '$lib/stores/calendar.svelte';
	import CalendarNavigation from './calendar-navigation.svelte';
	import { ChevronDown, ChevronUp } from 'lucide-svelte';

	const store = getContext<CalendarStore>('calendar');

	const MONTH_NAMES = [
		'January',
		'February',
		'March',
		'April',
		'May',
		'June',
		'July',
		'August',
		'September',
		'October',
		'November',
		'December'
	];

	const isWeekView = $derived(store.viewMode === 'week');

	/**
	 * The week's own dates, not the month's name.
	 *
	 * A folded week can straddle the turn of a month or a year, and saying
	 * "August" over a row that runs into September would be a lie — so the month
	 * is repeated on either side only when the two differ.
	 */
	const weekTitle = $derived.by(() => {
		const days = store.weekDays;
		const first = days[0];
		const last = days[days.length - 1];

		const shortMonth = (month: number) => MONTH_NAMES[month].slice(0, 3);

		if (first.year !== last.year) {
			return `${first.day} ${shortMonth(first.month)} ${first.year} – ${last.day} ${shortMonth(last.month)} ${last.year}`;
		}
		if (first.month !== last.month) {
			return `${first.day} ${shortMonth(first.month)} – ${last.day} ${shortMonth(last.month)} ${last.year}`;
		}
		return `${first.day} – ${last.day} ${MONTH_NAMES[first.month]} ${first.year}`;
	});

	const monthTitle = $derived(
		`${MONTH_NAMES[store.currentDate.getMonth()]} ${store.currentDate.getFullYear()}`
	);

	const title = $derived(isWeekView ? weekTitle : monthTitle);
</script>

<div class="flex items-center justify-between mb-4">
	<div class="flex items-center gap-1 min-w-0">
		<h2 class="text-lg font-semibold text-foreground truncate">{title}</h2>
		<button
			type="button"
			onclick={() => void store.toggleViewMode()}
			disabled={store.isLoading}
			class="shrink-0 rounded-lg p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
			aria-label={isWeekView ? 'Show the whole month' : 'Show only this week'}
			aria-expanded={!isWeekView}
			aria-controls="calendar-grid"
			title={isWeekView ? 'Show the whole month' : 'Show only this week'}
		>
			{#if isWeekView}
				<ChevronDown class="h-4 w-4" />
			{:else}
				<ChevronUp class="h-4 w-4" />
			{/if}
		</button>
	</div>
	<CalendarNavigation />
</div>
