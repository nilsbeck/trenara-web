<script lang="ts">
	import { setContext, untrack } from 'svelte';
	import { createCalendarStore, type CalendarStore } from '$lib/stores/calendar.svelte';
	import { createRevalidationTrigger } from '$lib/utils/revalidation';
	import type { Schedule } from '$lib/server/trenara/types';
	import CalendarHeader from './calendar-header.svelte';
	import CalendarGrid from './calendar-grid.svelte';
	import CalendarDetails from './calendar-details.svelte';
	import { Loader2 } from 'lucide-svelte';

	let {
		today,
		schedule,
		refreshPageData
	}: {
		today: Date;
		schedule: Schedule;
		/**
		 * Re-runs the page's `load`. Passed in rather than reached for here so
		 * the calendar stays usable outside a route that has one.
		 */
		refreshPageData?: () => Promise<unknown>;
	} = $props();

	// createCalendarStore only runs once — today is intentionally captured as the
	// initial value; the store manages its own currentDate state after that.
	// svelte-ignore state_referenced_locally
	const store: CalendarStore = createCalendarStore(today, { refreshPageData });

	setContext<CalendarStore>('calendar', store);

	// Initialise selected date on mount inside an effect so Svelte 5 doesn't
	// warn about capturing the initial prop value outside a closure.
	//
	// `today` is untracked deliberately: the page hands down a fresh `new Date()`
	// on every render, so tracking it would throw the runner's chosen day away
	// each time a background refresh brought new data in.
	$effect(() => {
		const day = untrack(() => today);
		store.setSelectedDate({
			year: day.getFullYear(),
			month: day.getMonth(),
			day: day.getDate()
		});
	});

	// Keep schedule in sync whenever the parent passes a new one — on first
	// render, and again after every background refresh. The month it covers goes
	// with it: if the runner has paged to March while a refresh for August was in
	// flight, August belongs in the cache, not on screen.
	$effect(() => {
		const incoming = schedule;
		store.setSchedule(
			incoming,
			untrack(() => today)
		);
	});

	// Sessions the runner changes come back from the mutation itself, so the only
	// thing left to catch is the coach's overnight rework. This asks the server
	// again when what is on screen is from before today, and otherwise does
	// nothing but move the store's idea of "today" on at midnight.
	$effect(() => {
		const trigger = createRevalidationTrigger({
			lastUpdatedAt: () => store.lastUpdatedAt,
			onCheck: () => store.syncToday(),
			onTrigger: () => void store.revalidate()
		});
		return () => trigger.stop();
	});
</script>

<div class="relative w-[28rem] mx-auto flex flex-col gap-4">
	{#if store.isLoading}
		<div
			class="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-background/60 backdrop-blur-sm"
		>
			<Loader2 class="h-8 w-8 animate-spin text-primary" />
		</div>
	{/if}

	<div class="rounded-xl bg-card shadow-lg border border-border p-4">
		<CalendarHeader />
		<CalendarGrid />
	</div>

	<CalendarDetails />
</div>
