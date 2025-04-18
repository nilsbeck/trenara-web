<script lang="ts">
	import type { CalendarProps, CalendarState, TrainingFilter } from './types';
	import type { ScheduledTraining, StrengthTraining, Entry, NutritionAdvice } from '$lib/server/api/types';
	import Loading from '../loading.svelte';
	import NutritionDetails from './nutritionDetails.svelte';
	import TrainingDetails from './trainingDetails.svelte';
	import StrengthDetails from './strengthDetails.svelte';
	import CalendarGrid from './CalendarGrid.svelte';
	import { Tab } from './types';
	import { getMonthScheduleData } from './utils';

	let selectedTab: Tab = $state(Tab.Training);
	let { today, schedule }: CalendarProps = $props();
	const initialDate = today || new Date();
	let currentDate = $state(initialDate);

	let isMonthDataLoading: boolean = $state(false);
	
	let calendarState: CalendarState = $state({
		selectedDate: null,
		currentDate: new Date(initialDate),
		daysInMonthWithOffset: [],
		firstDayOfMonth: 0,
		offsetAtEnd: 0,
		offsetAtStart: 0
	});

	let selectedDate = $derived(
		calendarState.selectedDate
			? `${calendarState.selectedDate.year}-${(calendarState.selectedDate.month + 1).toString().padStart(2, '0')}-${calendarState.selectedDate.day.toString().padStart(2, '0')}`
			: null
	);

	let selectedTraining: ScheduledTraining[] = $derived(
		schedule.trainings.filter((training: ScheduledTraining) => training.day_long === selectedDate)
	);

	let selectedTrainingStrength: StrengthTraining[] = $derived(
		schedule.strength_trainings.filter(
			(training: StrengthTraining) => training.day === selectedDate
		)
	);

	function getDateFromOffset(isoString: string): string {
		const date = new Date(isoString);
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, '0');
		const day = String(date.getDate()).padStart(2, '0');
		return `${year}-${month}-${day}`;
	}

	let selectedRunTrainingEntry: Entry[] = $derived(
		schedule?.entries?.filter((entry: Entry) => {
			const entryDate = getDateFromOffset(new Date(entry.start_time).toISOString());
			return entryDate === selectedDate && entry.type === 'run';
		}) ?? []
	);

	let selectedStrengthTrainingEntry: Entry[] = $derived(
		schedule.entries.filter((entry: Entry) => {
			const entryDate = getDateFromOffset(new Date(entry.start_time).toISOString());
			return entryDate === selectedDate && entry.type === 'strength';
		})
	);

	async function getMonthSchedule(timestamp: Date): Promise<void> {
		isMonthDataLoading = true;
		try {
			const response = await getMonthScheduleData(timestamp);
			schedule = response;
		} catch (error) {
			console.error('Failed to fetch month schedule:', error);
		} finally {
			isMonthDataLoading = false;
		}
	}

	let nutritionData: NutritionAdvice | null = $state(null);
	let nutritionDate: string | null = $state(null);
	let isNutritionLoading: boolean = $state(false);

	async function loadNutritionData(): Promise<void> {
		if (!selectedDate) return;
		
		isNutritionLoading = true;
		try {
			const response = await fetch(`/api/v0/nutrition?timestamp=${selectedDate}`);
			if (response.ok) {
				const data = await response.json();
				nutritionData = data;
				nutritionDate = selectedDate;
			}
		} catch (error) {
			console.error('Failed to fetch nutrition data:', error);
		} finally {
			isNutritionLoading = false;
		}
	}

	$effect(() => {
		if (selectedTab === Tab.Nutrition && selectedDate != nutritionDate) {
			loadNutritionData();
		}
	});

	function updateCalendar(onMount: boolean = false): void {
		const year = currentDate.getFullYear();
		const month = currentDate.getMonth();

		calendarState.firstDayOfMonth = new Date(year, month, 1).getDay();
		const isSunday = calendarState.firstDayOfMonth === 0;
		calendarState.offsetAtStart = isSunday ? calendarState.firstDayOfMonth + 6 : calendarState.firstDayOfMonth - 1;

		if (onMount) {
			calendarState.selectedDate = {
				year,
				month,
				day: currentDate.getDate() + calendarState.offsetAtStart
			};
		}

		let daysInCurrentMonthWithOffset = new Date(year, month + 1, 0).getDate() + calendarState.firstDayOfMonth - 1;
		if (isSunday) {
			daysInCurrentMonthWithOffset += 7;
		}
		calendarState.offsetAtEnd = daysInCurrentMonthWithOffset % 7;

		calendarState.daysInMonthWithOffset = Array.from(
			{ length: daysInCurrentMonthWithOffset },
			(_, i) => i + 1
		);
	}

	function goToPreviousMonth(): void {
		currentDate = new Date(currentDate.setMonth(currentDate.getMonth() - 1));
		calendarState.selectedDate = null;
		getMonthSchedule(currentDate);
		updateCalendar();
	}

	function goToNextMonth(): void {
		currentDate = new Date(currentDate.setMonth(currentDate.getMonth() + 1));
		calendarState.selectedDate = null;
		getMonthSchedule(currentDate);
		updateCalendar();
	}

	function handleDayClick(day: number): void {
		calendarState.selectedDate = {
			year: currentDate.getFullYear(),
			month: currentDate.getMonth(),
			day
		};
		selectedTab = selectedTraining.length > 0 || selectedRunTrainingEntry.length > 0 ? Tab.Training : Tab.Nutrition;
	}

	function hasTrainingEntriesForDate(filter: TrainingFilter): boolean {
		const year = currentDate.getFullYear();
		const month = currentDate.getMonth();
		const date = new Date(year, month, filter.day);

		if (filter.type === 'strength') {
			return schedule.strength_trainings.some((entry: StrengthTraining) => {
				const entryDate = new Date(entry.day).toISOString().split('T')[0];
				const calendarDate = date.toISOString().split('T')[0];
				return entryDate === calendarDate;
			});
		}

		const hasTrainingEntries = schedule.trainings.some((entry: ScheduledTraining) => {
			const entryDate = new Date(entry.day_long).toISOString().split('T')[0];
			const calendarDate = date.toISOString().split('T')[0];
			return entryDate === calendarDate;
		});

		if (hasTrainingEntries) {
			return true;
		}

		return schedule.entries.some((entry: Entry) => {
			const entryDate = new Date(entry.start_time).toISOString().split('T')[0];
			const calendarDate = date.toISOString().split('T')[0];
			return entryDate === calendarDate;
		});
	}

	// Initialize the calendar on component mount
	updateCalendar(true);
</script>

<div class="flex justify-center px-4">
	<div class="max-w-md w-full shadow-lg mx-auto items-center">
		{#if isMonthDataLoading}
			<div
				class="loading-overlay absolute inset-0 flex items-center justify-center dark:bg-gray-700 bg-gray-50 rounded-xl"
			>
				<Loading />
			</div>
		{/if}
		<div class="card rounded-t-xl rounded-b-none p-8 dark:bg-gray-800 bg-white">
			<div class="flex items-center justify-between">
				<h2 class="card-title text-left">
					{currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
				</h2>
				<div class="flex items-center">
					<button
						aria-label="calendar backward"
						class="focus:text-gray-400 hover:text-gray-400 text-gray-800 dark:text-gray-100"
						onclick={() => location.reload()}
					>
						<svg
							width="20"
							viewBox="0 0 24 24"
							xmlns="http://www.w3.org/2000/svg"
							xmlns:xlink="http://www.w3.org/1999/xlink"
							class="icon-tabler"
							fill="none"
							stroke="currentColor"
							stroke-width="1.5"
							stroke-linecap="round"
							stroke-linejoin="round"
							><path d="M20 11A8.1 8.1 0 0 0 4.5 9M4 5v4h4" /><path
								d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4"
							/></svg
						>
					</button>
					<button
						aria-label="calendar backward"
						class="focus:text-gray-400 hover:text-gray-400 text-gray-800 dark:text-gray-100"
						onclick={goToPreviousMonth}
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="icon icon-tabler icon-tabler-chevron-left"
							width="24"
							height="24"
							viewBox="0 0 24 24"
							stroke-width="1.5"
							stroke="currentColor"
							fill="none"
							stroke-linecap="round"
							stroke-linejoin="round"
						>
							<path stroke="none" d="M0 0h24v24H0z" fill="none" />
							<polyline points="15 6 9 12 15 18" />
						</svg>
					</button>
					<button
						aria-label="calendar forward"
						class="focus:text-gray-400 hover:text-gray-400 ml-3 text-gray-800 dark:text-gray-100"
						onclick={goToNextMonth}
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="icon icon-tabler icon-tabler-chevron-right"
							width="24"
							height="24"
							viewBox="0 0 24 24"
							stroke-width="1.5"
							stroke="currentColor"
							fill="none"
							stroke-linecap="round"
							stroke-linejoin="round"
						>
							<path stroke="none" d="M0 0h24v24H0z" fill="none" />
							<polyline points="9 6 15 12 9 18" />
						</svg>
					</button>
				</div>
			</div>
			<CalendarGrid
				{calendarState}
				{currentDate}
				onDayClick={handleDayClick}
				{hasTrainingEntriesForDate}
			/>
		</div>
		<div class="tabs tabs-border dark:bg-gray-700 bg-gray-50 rounded-b-xl w-full">
			{#if selectedTraining.length > 0 || selectedRunTrainingEntry.length > 0}
				<input
					type="radio"
					name="details-tab"
					class="tab"
					value="training"
					bind:group={selectedTab}
					aria-label="🏃🏻‍♂️‍➡️ Training"
				/>
				<div class="tab-content px-4" class:active={selectedTab === Tab.Training}>
					<TrainingDetails
						bind:schedule
						{selectedTraining}
						{selectedRunTrainingEntry}
						selectedDay={calendarState.selectedDate?.day ?? null}
						selectedMonth={calendarState.selectedDate?.month ?? null}
						selectedYear={calendarState.selectedDate?.year ?? null}
						{selectedDate}
					/>
				</div>
			{/if}
			{#if selectedTrainingStrength.length > 0}
				<input
					type="radio"
					name="details-tab"
					class="tab"
					value="strength"
					bind:group={selectedTab}
					aria-label="💪 Strength"
				/>
				<div class="tab-content px-6" class:active={selectedTab === Tab.Strength}>
					<StrengthDetails selectedDate={selectedDate} strengthData={selectedTrainingStrength[0]} isStrengthLoading={isMonthDataLoading} />
				</div>
			{/if}
			<input
				type="radio"
				name="details-tab"
				class="tab"
				value="nutrition"
				bind:group={selectedTab}
				aria-label="🥪 Nutrition"
			/>
			<div class="tab-content px-6" class:active={selectedTab === Tab.Nutrition}>
				<NutritionDetails {selectedDate} {nutritionDate} {nutritionData} {isNutritionLoading} />
			</div>
		</div>
	</div>
</div>

<style>
	.loading-overlay {
		position: absolute; /* Change to absolute */
		top: 50%; /* Align to the top of the parent */
		left: 50%; /* Align to the left of the parent */
		transform: translate(-50%, -50%); /* Center the loading overlay */
		width: 80%; /* Cover the full width of the parent */
		height: 30%; /* Cover the full height of the parent */

		display: flex;
		justify-content: center;
		align-items: center;
		z-index: 1000; /* Ensure it is above other content */
	}
</style>
