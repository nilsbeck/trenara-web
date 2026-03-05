<script lang="ts">
	import { setContext } from 'svelte';
	import { createCalendarStore, type CalendarStore } from '$lib/stores/calendar.svelte';
	import type { Schedule } from '$lib/server/trenara/types';
	import CalendarHeader from './calendar-header.svelte';
	import CalendarGrid from './calendar-grid.svelte';
	import CalendarDetails from './calendar-details.svelte';
	import { Loader2 } from 'lucide-svelte';

	let { today, schedule }: { today: Date; schedule: Schedule } = $props();

	// createCalendarStore only runs once — today is intentionally captured as the
	// initial value; the store manages its own currentDate state after that.
	// svelte-ignore state_referenced_locally
	const store: CalendarStore = createCalendarStore(today);

	setContext<CalendarStore>('calendar', store);

	// Initialise selected date on mount inside an effect so Svelte 5 doesn't
	// warn about capturing the initial prop value outside a closure.
	$effect(() => {
		store.setSelectedDate({
			year: today.getFullYear(),
			month: today.getMonth(),
			day: today.getDate()
		});
	});

	// Keep schedule in sync whenever the parent passes a new one.
	$effect(() => {
		store.setSchedule(schedule);
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
