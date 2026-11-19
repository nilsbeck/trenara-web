<script lang="ts">
	import { setContext, untrack } from 'svelte';
	import { createCalendarStore, type CalendarStore } from '#lib/stores/calendar.svelte.js';
	import { createRevalidationTrigger } from '#lib/utils/revalidation.js';
	import { whenIdle } from '#lib/utils/load-once.js';
	import { initialCalendarDay } from '#lib/utils/initial-day.js';
	import { reconcileRatedEntries } from '#lib/utils/rated-locally.js';
	import type { Schedule } from '#lib/server/trenara/types.js';
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

	/**
	 * The plan, and the day the calendar opens on, seated while the component is
	 * set up rather than by effects once it has mounted.
	 *
	 * Effects do not run on the server, and both of these used to be effects.
	 * So the dashboard's server-rendered HTML was a month of empty days: the
	 * load had awaited five or six weeks of schedule from Trenara and serialised
	 * them into the page, and the first paint showed none of it — no session on
	 * any day, no detail under the grid. The plan arrived only once the page's
	 * JavaScript had downloaded and hydrated, which on a phone opening the app
	 * from its home screen is the longest wait of the launch, spent looking at
	 * what reads as a rest week.
	 *
	 * Seated here, the server renders them, and the browser seats the same thing
	 * while it hydrates. `initialCalendarDay` is pure. The one input that can
	 * differ between the two is `reconcileRatedEntries`, which reads this
	 * browser's own memory of a rating it just made (`rated-locally.ts`) and has
	 * nothing to read on the server: in the minutes after a rating, the browser
	 * can open on a later day than the HTML did, and hydration repaints the
	 * difference — which is exactly the case that memory exists for. The page's
	 * own schedule has not been through the store's reconciliation when the
	 * opening day is picked from it, so it is reconciled the same way here, or a
	 * reload landing on a read that has not caught up with a rating would open
	 * right back on the session it was just cleared off.
	 *
	 * Seated first, too, ahead of the opening-day paging and the viewport fold
	 * below: each of those can go and fetch a month of its own, and with the
	 * page's month already in `scheduleCache` they find it cached and current
	 * instead of asking Trenara for it a second time.
	 *
	 * Untracked throughout: the page hands down a fresh `new Date()` and, on
	 * every re-run of any load above it, a fresh `data` object, so tracking
	 * either would throw the runner's chosen day away on each background
	 * refresh. Both are first-paint decisions, not standing ones.
	 */
	let seated: Schedule = untrack(() => schedule);
	const opening: Date = untrack(() => {
		store.setSchedule(seated, today);

		const day = initialCalendarDay(
			{ ...seated, entries: reconcileRatedEntries(seated.entries) },
			today
		);
		store.setSelectedDate({ year: day.getFullYear(), month: day.getMonth(), day: day.getDate() });
		return day;
	});

	// A schedule the parent passes later — from a page load that really ran
	// again — is seated as it arrives. The month it covers goes with it: if the
	// runner has paged to March while a refresh for August was in flight, August
	// belongs in the cache, not on screen.
	//
	// Only a schedule it has not seated before, though. The page passes
	// `data.schedule`, and SvelteKit hands the page a new `data` object whenever
	// any load above it re-runs — `refreshPageData`'s `invalidate('app:news')`
	// among them — with the page's own load not re-run and `data.schedule` the
	// very same object as before. That object is the plan as it stood when the
	// page loaded, and seating it again took back everything changed since: a
	// PWA resumed the next day revalidated, re-ran the layout load, and asked
	// for the rating of a session the runner had rated the evening before.
	$effect(() => {
		const incoming = schedule;
		if (incoming === seated) return;
		seated = incoming;
		store.setSchedule(
			incoming,
			untrack(() => today)
		);
	});

	// The opening day can land outside the month the page loaded — a session
	// late last month still waiting on a rating, or the next one over the turn
	// of the month. Page the grid there too, or the highlight sits on a day it
	// is not showing. That is a fetch, so it waits for the browser.
	$effect(() => {
		const day = untrack(() => today);
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

	// The months the weeks either side of the folded one reach into, fetched
	// once the page is idle after each step, so the next step across the turn
	// of a month does not wait on the whole new month behind the overlay. Syncs
	// with the network; nothing here writes state the component reads.
	$effect(() => {
		if (store.viewMode !== 'week') return;
		// Re-run when the week moves.
		void store.weekDays[0];
		return whenIdle(() => void store.prefetchAdjacentWeeks());
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
