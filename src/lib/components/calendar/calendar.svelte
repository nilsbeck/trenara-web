<script lang="ts">
	import type { CalendarProps } from './types';
	import type { ScheduledTraining, StrengthTraining, Entry } from '$lib/server/api/types';
	import { createCalendarStore } from '$lib/stores/calendar.store.js';
	import CalendarProvider from './CalendarProvider.svelte';
	import CalendarHeader from './CalendarHeader.svelte';
	import CalendarGridWithContext from './CalendarGridWithContext.svelte';
	import CalendarDetails from './CalendarDetails.svelte';
	import Loading from '../loading.svelte';
	import { Tab } from './types';

	let selectedTab: Tab = $state(Tab.Training);
	let { today, schedule }: CalendarProps = $props();
	const initialDate = today || new Date();
	
	// Create calendar store
	const calendarStore = createCalendarStore(initialDate);
	
	// Initialize store with provided schedule and load data
	let initialized = false;
	$effect(() => {
		if (!initialized) {
			initialized = true;
			if (schedule) {
				// Server-side data mode: use provided schedule
				calendarStore.setSchedule(schedule);
			} else {
				// Client-side data mode: load data via API
				calendarStore.loadMonthData(initialDate);
			}
		}
	});

	// Subscribe to store values
	let storeState = $state();
	
	// Subscribe to the store
	$effect(() => {
		const unsubscribe = calendarStore.subscribe((state) => {
			storeState = state;
		});
		
		return unsubscribe;
	});

	// Derived values from store state
	let selectedDate = $derived(storeState?.selectedDateString);
	let selectedTraining = $derived(storeState?.filteredTrainings || []);
	let selectedTrainingStrength = $derived(storeState?.filteredStrengthTrainings || []);

	function getDateFromOffset(isoString: string): string {
		const date = new Date(isoString);
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, '0');
		const day = String(date.getDate()).padStart(2, '0');
		return `${year}-${month}-${day}`;
	}

	let selectedRunTrainingEntry: Entry[] = $derived(
		storeState?.schedule?.entries?.filter((entry: Entry) => {
			const entryDate = getDateFromOffset(new Date(entry.start_time).toISOString());
			return entryDate === selectedDate && entry.type === 'run';
		}) ?? []
	);

	let selectedStrengthTrainingEntry: Entry[] = $derived(
		storeState?.schedule?.entries?.filter((entry: Entry) => {
			const entryDate = getDateFromOffset(new Date(entry.start_time).toISOString());
			return entryDate === selectedDate && entry.type === 'strength';
		}) ?? []
	);

	// Initialize the calendar on component mount
	$effect(() => {
		if (storeState && storeState.selectedDate === null) {
			calendarStore.setSelectedDate({
				year: storeState.currentDate.getFullYear(),
				month: storeState.currentDate.getMonth(),
				day: storeState.currentDate.getDate()
			});
		}
	});
</script>

<CalendarProvider store={calendarStore}>
	<div class="flex justify-center px-4">
		<div class="max-w-md w-full shadow-lg mx-auto items-center">
			{#if storeState?.isLoading}
				<div
					class="loading-overlay absolute inset-0 flex items-center justify-center dark:bg-gray-700 bg-gray-50 rounded-xl"
				>
					<Loading />
				</div>
			{/if}
			<div class="card rounded-t-xl rounded-b-none p-8 dark:bg-gray-800 bg-white">
				<CalendarHeader />
				<CalendarGridWithContext />
			</div>
			<CalendarDetails 
				bind:selectedTab
				{selectedTraining}
				{selectedTrainingStrength}
				{selectedRunTrainingEntry}
				{selectedStrengthTrainingEntry}
			/>
		</div>
	</div>
</CalendarProvider>

<style>
	.loading-overlay {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		width: 80%;
		height: 30%;
		display: flex;
		justify-content: center;
		align-items: center;
		z-index: 1000;
	}
</style>
