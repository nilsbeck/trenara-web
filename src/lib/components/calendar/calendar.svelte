<script lang="ts">
	import { setContext, untrack } from 'svelte';
	import { createCalendarStore, type CalendarStore } from '$lib/stores/calendar.svelte';
	import { createRevalidationTrigger } from '$lib/utils/revalidation';
	import { initialCalendarDay } from '$lib/utils/initial-day';
	import { reconcileRatedEntries } from '$lib/utils/rated-locally';
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
	// Everything read here is untracked deliberately: the page hands down a
	// fresh `new Date()` and a fresh schedule on every render, so tracking them
	// would throw the runner's chosen day away each time a background refresh
	// brought new data in. The opening day is a first-paint decision, not a
	// standing one.
	$effect(() => {
		const day = untrack(() => today);
		// The page's own schedule has not been through the store's reconciliation
		// yet — that only happens once `setSchedule` runs, below, and this effect
		// reads no further than the prop itself. Reconciled the same way here, or
		// a reload landing on a read that has not caught up with a rating this
		// browser just made opens right back on the session it was just cleared
		// off, instead of moving past it.
		const rawSchedule = untrack(() => schedule);
		const reconciledSchedule: Schedule = {
			...rawSchedule,
			entries: reconcileRatedEntries(rawSchedule.entries)
		};
		const opening = untrack(() => initialCalendarDay(reconciledSchedule, day));

		store.setSelectedDate({
			year: opening.getFullYear(),
			month: opening.getMonth(),
			day: opening.getDate()
		});

		// The pick can land outside the month the page loaded — a session late
		// last month still waiting on a rating, or the next one over the turn of
		// the month. Page the grid there too, or the highlight sits on a day it
		// is not showing.
		if (opening.getFullYear() !== day.getFullYear() || opening.getMonth() !== day.getMonth()) {
			untrack(() => void store.loadMonthData(opening));
		}
	});

	/*
		Which view the screen asks for.

		A phone fits one week and the session under it; a month grid on that width
		pushes the detail off the bottom of the screen. So the calendar opens
		folded below `md` — the same line the navbar uses to tell a phone from
		everything else — and opens on the month above it. It keeps following the
		viewport across a resize or a turn of the device, right up until the runner
		works the fold arrow themselves, after which their choice is the only one
		that counts.
	*/
	$effect(() => {
		if (typeof window.matchMedia !== 'function') return;

		const query = window.matchMedia('(max-width: 767px)');
		const apply = () => void store.setPreferredViewMode(query.matches ? 'week' : 'month');

		apply();
		query.addEventListener('change', apply);
		return () => query.removeEventListener('change', apply);
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

<div class="relative w-[28rem] max-w-full mx-auto flex flex-col gap-4">
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
