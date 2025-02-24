<script lang="ts">
	import type { Schedule, ScheduledTraining, StrengthTraining, Entry } from '$lib/server/api/types';
	import Loading from './loading.svelte';
	let { today, schedule }: { today: Date; schedule: Schedule } = $props();

	let isLoading: boolean = $state(false); // Add loading state

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
		isLoading = true;
		const response = await fetch('/user/month/?timestamp=' + timestamp.getTime(), {
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
			isLoading = false;
			return;
		}

		const data = await response.json();
		schedule = data;
		isLoading = false;
	}

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
	}

	// Initialize the calendar on component mount
	updateCalendar(true);
</script>

{#snippet listItem(text: string)}
	<svg
		xmlns="http://www.w3.org/2000/svg"
		class="size-4 me-2 inline-block text-success"
		fill="none"
		viewBox="0 0 24 24"
		stroke="currentColor"
		><path
			stroke-linecap="round"
			stroke-linejoin="round"
			stroke-width="2"
			d="M5 13l4 4L19 7"
		/></svg
	>
	<span>{text}</span>
{/snippet}

<div class="flex justify-center flex-grow">
	<div class="max-w-sm min-w-sm w-full shadow-lg mx-auto items-center">
		<div class="card rounded-t-xl rounded-b-none p-8 dark:bg-gray-800 bg-white">
			{#if isLoading}
				<div
					class="loading-overlay absolute inset-0 flex items-center justify-center dark:bg-gray-700 bg-gray-50 rounded-xl"
				>
					<Loading />
				</div>
			{/if}
			<div class="flex items-center justify-between">
				<h2 class="card-title">
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
												<p class="text-base text-gray-500 dark:text-gray-100">
													{day - offsetAtStart}
												</p>
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
		{#each selectedTraining as training}
			{#if training}
				<div class="md:py-8 py-5 dark:bg-gray-700 bg-gray-50 rounded-b-xl w-full mb-4">
					<div class="px-4">
						<div class=" border-gray-400">
							<h2 class="card-title">{training.title}</h2>
							<p class="text-sm pt-2 mt-2 leading-4">
								{training.description}
							</p>
							{#if selectedRunTrainingEntry.length > 0}
								<p class="text-sm pt-2 mt-2 leading-4">
									{selectedRunTrainingEntry[0].notification?.content}
								</p>
							{/if}
							<ul class="mt-6 flex flex-col gap-2 text-xs">
								{#each training.training.blocks as block}
									{#if block.text !== undefined}
										<li>
											{@render listItem(block.text)}
										</li>
									{:else if block.blocks && block.blocks.length > 1}
										{#if block.repeat !== 1}
											<li>
												{@render listItem(`Repeat ${block.repeat}x`)}
												<ul>
													{#each block.blocks as innerBlock}
														<li class="ml-6">
															{@render listItem(innerBlock.text)}
														</li>
													{/each}
												</ul>
											</li>
										{:else}
											<li>
												<ul>
													{#each block.blocks as innerBlock}
														<li>
															{@render listItem(innerBlock.text)}
														</li>
													{/each}
												</ul>
											</li>
										{/if}
									{:else if block.blocks && block.blocks.length === 1}
										<li>
											{@render listItem(block.blocks[0].text)}
										</li>
									{/if}
								{/each}
							</ul>
							<div class="mt-6">
								<table class="w-full text-xs">
									<thead>
										<tr>
											<th class="text-left">Metric</th>
											<th class="text-left">Plan</th>
											{#if selectedRunTrainingEntry.length > 0}
												<th class="text-left">Actual</th>
											{/if}
										</tr>
									</thead>
									<tbody>
										<tr>
											<td class="text-left">Total Distance</td>
											<td class="text-left">{training.training.total_distance}</td>
											{#if selectedRunTrainingEntry.length > 0}
												<td class="text-left">{selectedRunTrainingEntry[0].distance}</td>
											{/if}
										</tr>
										<tr>
											<td class="text-left">Core</td>
											<td class="text-left">{training.training.core_distance}</td>
											{#if selectedRunTrainingEntry.length > 0}
												<td class="text-left">-</td>
											{/if}
										</tr>
										<tr>
											<td class="text-left">Time</td>
											<td class="text-left">{training.training.total_time}</td>
											{#if selectedRunTrainingEntry.length > 0}
												<td class="text-left">{selectedRunTrainingEntry[0].time}</td>
											{/if}
										</tr>
										<tr>
											<td class="text-left">Heartrate</td>
											<td class="text-left">-</td>
											{#if selectedRunTrainingEntry.length > 0}
												<td class="text-left">{selectedRunTrainingEntry[0].avg_heartbeat}</td>
											{/if}
										</tr>
										<tr>
											<td class="text-left">Elevation</td>
											<td class="text-left">-</td>
											{#if selectedRunTrainingEntry.length > 0}
												<td class="text-left">{selectedRunTrainingEntry[0].total_altitude}</td>
											{/if}
										</tr>
									</tbody>
								</table>
							</div>
						</div>
					</div>
				</div>
			{/if}
		{:else}
			<div class="md:py-8 py-5 dark:bg-gray-700 bg-gray-50 rounded-b-xl w-full mb-4">
				<div class="px-4">
					<div class=" border-gray-400 flex">
						<p class="text-m pt-2 mt-2 leading-4 text-center">
							No training scheduled for this day. Time to rest! 😴​
						</p>
					</div>
				</div>
			</div>
		{/each}
	</div>
</div>

<style>
	.selected {
		background-color: var(--color-secondary);
	}
	.today {
		background-color: rgba(211, 211, 211, 0.425); /* Change this to your desired color */
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
</style>
