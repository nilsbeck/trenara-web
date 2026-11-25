<script lang="ts">
	import { untrack } from 'svelte';
	import {
		createCalendarStore,
		setCalendarStore,
		MonthNotSavedError
	} from '#lib/stores/calendar.svelte.js';
	import { initialCalendarDay } from '#lib/utils/initial-day.js';
	import { monthStart, type OfflinePlan } from '#lib/utils/offline-plan.js';
	import CalendarHeader from './calendar-header.svelte';
	import CalendarGrid from './calendar-grid.svelte';
	import StrengthDetails from './strength-details.svelte';
	import TrainingSummary from './training-summary.svelte';

	/**
	 * The calendar, drawn from the plan kept on this device, with nothing on it
	 * that changes the plan.
	 *
	 * The header and the grid are the dashboard's own — month and week, the
	 * arrows, the dots, picking a day — on the calendar store in `readOnly`
	 * mode, which fetches nothing: a month that was not kept shows as an empty
	 * grid with a line saying so. Below it, the day is drawn by
	 * `training-summary` and `strength-details` instead of the regular panel,
	 * because that panel is where every action lives. No nutrition tab: the
	 * advice is fetched per day and was never kept.
	 *
	 * The plan is seeded once, during setup. It comes from storage, so there is
	 * no later copy to follow, and the page only mounts this once it has one.
	 */
	let { plan, today }: { plan: OfflinePlan; today: Date } = $props();

	// svelte-ignore state_referenced_locally
	const store = createCalendarStore(today, { readOnly: true });
	setCalendarStore(store);

	untrack(() => {
		for (const { month, schedule } of plan.months) store.setSchedule(schedule, monthStart(month));
		// The month holding today is the one on screen; `setSchedule` files the
		// others in the cache, where paging finds them.
		const thisMonth = plan.months.find(({ month }) => month === keyOf(today));
		const day = initialCalendarDay(thisMonth?.schedule, today);
		store.setSelectedDate({ year: day.getFullYear(), month: day.getMonth(), day: day.getDate() });
		// A plan that ends before this month opens on an empty month, as the
		// dashboard would; the arrows go back to where it is.
	});

	function keyOf(date: Date): string {
		return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
	}

	// The same fold the dashboard makes: a week on a phone, the month above.
	// A listener on a media query is outside Svelte, which is what this is for;
	// the store's own `setPreferredViewMode` leaves alone a choice the runner
	// made with the fold arrow.
	$effect(() => {
		if (typeof window.matchMedia !== 'function') return;
		const query = window.matchMedia('(max-width: 767px)');
		const apply = () => void store.setPreferredViewMode(query.matches ? 'week' : 'month');
		apply();
		query.addEventListener('change', apply);
		return () => query.removeEventListener('change', apply);
	});

	const notSaved = $derived(store.error instanceof MonthNotSavedError);
	const training = $derived(store.filteredTrainings[0] ?? null);
	const entry = $derived(store.selectedRunEntries[0] ?? null);
	const strength = $derived(store.filteredStrengthTrainings[0] ?? null);

	type Tab = 'training' | 'strength';
	/** The tab the runner picked, and for which day: a new day starts on its own default. */
	let chosen = $state<{ day: string | null; tab: Tab } | null>(null);
	// A day with only strength opens on it; otherwise training, as the
	// dashboard does.
	const tab = $derived<Tab>(
		chosen && chosen.day === store.selectedDateString
			? chosen.tab
			: training || entry || !strength
				? 'training'
				: 'strength'
	);
</script>

<div class="mx-auto flex w-[28rem] max-w-full flex-col gap-4">
	<div class="rounded-xl border border-border bg-card p-4 shadow-lg">
		<CalendarHeader />
		<CalendarGrid />
	</div>

	{#if notSaved}
		<p class="text-center text-sm text-muted-foreground" data-testid="offline-month-missing">
			This period isn't saved on this device.
		</p>
	{:else if store.selectedDate}
		<div class="overflow-hidden rounded-xl border border-border bg-card shadow-lg">
			{#if (training || entry) && strength}
				<div class="flex border-b border-border">
					{#each ['training', 'strength'] as const as option (option)}
						<button
							type="button"
							class="flex-1 px-4 py-2.5 text-sm font-medium transition-colors"
							class:text-foreground={tab === option}
							class:border-b-2={tab === option}
							class:border-primary={tab === option}
							class:text-muted-foreground={tab !== option}
							onclick={() => (chosen = { day: store.selectedDateString, tab: option })}
							>{option === 'training' ? 'Training' : 'Strength'}</button
						>
					{/each}
				</div>
			{/if}
			<div class="p-4">
				{#if tab === 'strength'}
					<StrengthDetails
						selectedDate={store.selectedDateString}
						strengthData={strength}
						isLoading={false}
					/>
				{:else}
					<TrainingSummary {training} {entry} />
				{/if}
			</div>
		</div>
	{/if}
</div>
