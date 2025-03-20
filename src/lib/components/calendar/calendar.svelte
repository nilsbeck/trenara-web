<script lang="ts">
	import type {
		Schedule,
		ScheduledTraining,
		StrengthTraining,
		Entry,
		NutritionAdvice
	} from '$lib/server/api/types';
	import Loading from '../loading.svelte';
	import NutritionDetails from './nutritionDetails.svelte';
	import TrainingDetails from './trainingDetails.svelte';
	import StrengthDetails from './strengthDetails.svelte';
	import { Tab } from './types';

	let selectedTab: Tab = $state(Tab.Training); // Initialize with the default tab
	let { today, schedule }: { today: Date; schedule: Schedule } = $props();

	let isMonthDataLoading: boolean = $state(false); // Add loading state
	// Initialize currentDate with today's date
	let currentDate = $state(today || new Date()); // Use today if provided, otherwise use new Date()
	let daysInMonthWithOffset: number[] = $state([]);
	let firstDayOfMonth: number = $state(0);
	let offsetAtEnd: number = $state(0);
	let offsetAtStart: number = $state(0);

	let selectedDay: number | null = $state(today?.getDate() || new Date().getDate());
	let selectedMonth: number | null = $state(today?.getMonth() || new Date().getMonth());
	let selectedYear: number | null = $state(today?.getFullYear() || new Date().getFullYear());

	let selectedDate = $derived(
		selectedDay && selectedMonth && selectedYear
			? `${selectedYear}-${(selectedMonth + 1).toString().padStart(2, '0')}-${(selectedDay - offsetAtStart).toString().padStart(2, '0')}`
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

	let selectedRunTrainingEntry: Entry[] = $derived(
		schedule.entries.filter((entry: Entry) => {
			const entryDate = new Date(entry.start_time).toISOString().split('T')[0]; // Extract date part
			return entryDate === selectedDate && entry.type === 'run'; // Compare with selectedDate and filter by type
		})
	);

	let selectedStrengthTrainingEntry: Entry[] = $derived(
		schedule.entries.filter((entry: Entry) => {
			const entryDate = new Date(entry.start_time).toISOString().split('T')[0]; // Extract date part
			return entryDate === selectedDate && entry.type === 'strength'; // Compare with selectedDate and filter by type
		})
	);

	async function getMonthSchedule(timestamp: Date) {
		isMonthDataLoading = true;
		const response = await fetch('/api/v0/monthSchedule/?timestamp=' + timestamp.getTime(), {
			method: 'GET',
			headers: {
				'content-type': 'application/json'
			}
		});

		if (!response.ok) {
			if (response.status === 401) {
				window.location.href = '/login';
			}
			console.error('Failed to fetch month schedule: ', response.statusText);
			isMonthDataLoading = false;
			return;
		}

		const data = await response.json();

		schedule = data;
		isMonthDataLoading = false;
	}

	let nutritionData: NutritionAdvice | null = $state(null);
	let nutritionDate: string | null = $state(null);
	let isNutritionLoading: boolean = $state(false);

	// Function to update the calendar view
	function updateCalendar(onMount: boolean = false) {
		const year = currentDate.getFullYear();
		const month = currentDate.getMonth();

		// Get the starting day of the month (0 = Sunday, 6 = Saturday)
		firstDayOfMonth = new Date(year, month, 1).getDay();
		const isSunday = firstDayOfMonth == 0;
		offsetAtStart = firstDayOfMonth == 0 ? firstDayOfMonth + 6 : firstDayOfMonth - 1;

		selectedMonth = month;
		selectedYear = year;
		if (onMount) {
			selectedDay = currentDate.getDate() + offsetAtStart;
		}

		// Get the number of days in the month
		let daysInCurrentMonthWithOffset = new Date(year, month + 1, 0).getDate() + firstDayOfMonth - 1;
		if (isSunday) {
			daysInCurrentMonthWithOffset = daysInCurrentMonthWithOffset + 7;
		}
		offsetAtEnd = daysInCurrentMonthWithOffset % 7;

		daysInMonthWithOffset = Array.from({ length: daysInCurrentMonthWithOffset }, (_, i) => i + 1);
	}

	// Function to go to the previous month
	function goToPreviousMonth() {
		currentDate = new Date(currentDate.setMonth(currentDate.getMonth() - 1)); // Update currentDate
		selectedMonth = currentDate.getMonth();
		selectedYear = currentDate.getFullYear();
		selectedDay = null;
		getMonthSchedule(currentDate);
		updateCalendar(); // Update the calendar view
	}

	// Function to go to the next month
	function goToNextMonth() {
		currentDate = new Date(currentDate.setMonth(currentDate.getMonth() + 1)); // Update currentDate
		selectedMonth = currentDate.getMonth();
		selectedYear = currentDate.getFullYear();
		selectedDay = null;
		getMonthSchedule(currentDate);
		updateCalendar(); // Update the calendar view
	}

	function handleDayClick(day: number) {
		selectedDay = day;
		selectedTab = Tab.Training;
	}

	async function fetchNutritionData(selectedDate: string | null) {
		if (selectedDate == null || (nutritionDate == selectedDate && nutritionData != null)) {
			return;
		}
		isNutritionLoading = true;
		const response = await fetch('/api/v0/nutrition/?timestamp=' + selectedDate, {
			method: 'GET',
			headers: {
				'content-type': 'application/json'
			}
		});

		if (!response.ok) {
			if (response.status === 401) {
				window.location.href = '/login';
			}
			console.error('Failed to fetch month schedule: ', response.statusText);
			isNutritionLoading = false;
			return;
		}

		const data = await response.json();

		nutritionData = data as NutritionAdvice;
		nutritionDate = selectedDate;
		isNutritionLoading = false;
	}

	$effect(() => {
		if (selectedDate != nutritionDate) {
			fetchNutritionData(selectedDate);
		}
		if (selectedTraining.length == 0) {
			selectedTab = Tab.Nutrition;
		}
	});

	// Function to check if there are any run or strength training entries for the month
	function hasTrainingEntriesForDate(type: 'run' | 'strength', day: number): boolean {
		if (type === 'strength') {
			const entries = schedule.strength_trainings;
			return entries.some((entry: StrengthTraining) => {
				const entryDate = new Date(entry.day).toISOString().split('T')[0]; // Extract date part
				const calendarDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), day)
					.toISOString()
					.split('T')[0]; // Compare with currentDate using day
				return entryDate === calendarDate;
			});
		}
		const entries = schedule.trainings;
		return entries.some((entry: ScheduledTraining) => {
			const entryDate = new Date(entry.day_long).toISOString().split('T')[0]; // Extract date part
			const calendarDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), day)
				.toISOString()
				.split('T')[0]; // Compare with currentDate using day
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
			<div class="flex items-center justify-between pt-6 overflow-x-auto">
				<table class="w-full">
					<thead>
						<tr>
							<th>Mo</th>
							<th>Tu</th>
							<th>We</th>
							<th>Th</th>
							<th>Fr</th>
							<th>Sa</th>
							<th>Su</th>
						</tr>
					</thead>
					<tbody>
						{#each Array(Math.ceil((daysInMonthWithOffset.length + offsetAtStart + offsetAtEnd) / 7)) as _, rowIndex}
							<tr>
								{#each daysInMonthWithOffset.slice(rowIndex * 7, (rowIndex + 1) * 7) as day}
									<td>
										{#if day - offsetAtStart < 1}
											<div class="px-2 py-2 cursor-pointer flex w-full justify-center">
												<p class="text-base text-gray-300"></p>
											</div>
										{:else}
											<div
												class="px-2 py-2 cursor-pointer flex w-full justify-center"
												class:selected={selectedDay === day &&
													selectedMonth === currentDate.getMonth() &&
													selectedYear === currentDate.getFullYear()}
												class:today={currentDate.getDate() === day - offsetAtStart &&
													currentDate.getMonth() === new Date().getMonth() &&
													currentDate.getFullYear() === new Date().getFullYear() &&
													selectedDay !== day}
												onclick={() => handleDayClick(day)}
												aria-label={`Select day ${day - offsetAtStart}`}
												role="button"
												tabindex="0"
												onkeydown={(e) => {
													if (e.key === 'Enter' || e.key === ' ') {
														handleDayClick(day);
													}
												}}
											>
												<div class="flex flex-col items-center">
													<p class="text-base text-gray-500 dark:text-gray-100">
														{day - offsetAtStart}
													</p>
													<div class="flex flex-row items-center">
														{#if hasTrainingEntriesForDate('run', day - offsetAtStart + 1)}
															<span class="dot run-dot"></span>
														{/if}
														{#if hasTrainingEntriesForDate('strength', day - offsetAtStart + 1)}
															<span class="dot strength-dot"></span>
														{/if}
														{#if !hasTrainingEntriesForDate('run', day - offsetAtStart + 1) && !hasTrainingEntriesForDate('strength', day - offsetAtStart + 1)}
															<span class="dot"></span>
														{/if}
													</div>
												</div>
											</div>
										{/if}
									</td>
								{/each}
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>
		<div class="tabs tabs-border dark:bg-gray-700 bg-gray-50 rounded-b-xl w-full">
			{#if selectedTraining.length > 0}
			<input
				type="radio"
				name="details-tab"
				class="tab"
				value="training"
				bind:group={selectedTab}
				aria-label="🏃🏻‍♂️‍➡️ Training"
			/>
			<div class="tab-content px-6" class:active={selectedTab === Tab.Training}>
				<TrainingDetails
					{selectedTraining}
					{selectedRunTrainingEntry}
					{selectedDay}
					{selectedMonth}
					{selectedYear}
					{selectedDate}
				/>
			</div>
			{/if}
			{#if selectedStrengthTrainingEntry.length > 0}
			<input
				type="radio"
				name="details-tab"
				class="tab"
				value="strength"
				bind:group={selectedTab}
				aria-label="💪 Strength"
			/>
			<div class="tab-content px-6" class:active={selectedTab === Tab.Strength}>
				<StrengthDetails {selectedTrainingStrength} />
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
	.selected {
		background-color: var(--color-secondary);
	}
	.today {
		background-color: rgba(234, 234, 234, 0.72); /* Change this to your desired color */
	}

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

	.dot {
		display: inline-block;
		width: 8px; /* Adjust size as needed */
		height: 8px; /* Adjust size as needed */
		border-radius: 50%; /* Make it circular */
		margin-top: 4px; /* Space between the text and the dot */
	}

	.run-dot {
		background-color: rgb(56, 76, 255); /* Color for run training */
	}

	.strength-dot {
		background-color: rgb(111, 111, 255); /* Color for strength training */
	}
</style>
