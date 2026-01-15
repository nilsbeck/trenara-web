<script lang="ts">
	import { error } from '@sveltejs/kit';
	import changeDateIcon from '/src/assets/change-date.svg';
	import type { Schedule, ScheduledTraining, SaveScheduleResponse } from '$lib/server/api';
	import { api } from '$lib/utils/api-client.js';

	let changeDateModal: HTMLDialogElement = $state() as HTMLDialogElement;
	let saveDateLoading: boolean = $state(false);
	let changeToDate: Date | null = $state(null);
	let pickerCurrentDate: Date = $state(new Date()); // Current month being displayed in picker

	let {
		schedule = $bindable(),
		selectedTraining,
		selectedDay,
		selectedMonth,
		selectedYear
	}: {
		schedule: Schedule;
		selectedTraining: ScheduledTraining[];
		selectedDay: number | null;
		selectedMonth: number | null;
		selectedYear: number | null;
	} = $props();

	// Get today's date for comparison
	const today = new Date();
	today.setHours(0, 0, 0, 0); // Reset time for accurate comparison

	// Generate calendar days for the custom picker
	function generateCalendarDays(currentDate: Date) {
		const year = currentDate.getFullYear();
		const month = currentDate.getMonth();
		
		// Get first day of month and calculate offset
		const firstDay = new Date(year, month, 1);
		const lastDay = new Date(year, month + 1, 0);
		const firstDayOfWeek = (firstDay.getDay() + 6) % 7; // Convert Sunday=0 to Monday=0
		
		const days = [];
		
		// Add days from previous month
		const prevMonth = new Date(year, month - 1, 0);
		for (let i = firstDayOfWeek - 1; i >= 0; i--) {
			const dayDate = new Date(year, month - 1, prevMonth.getDate() - i);
			days.push({
				date: dayDate,
				dayNumber: dayDate.getDate(),
				isCurrentMonth: false,
				isToday: false,
				isSelected: false,
				isPast: dayDate < today
			});
		}
		
		// Add days from current month
		for (let day = 1; day <= lastDay.getDate(); day++) {
			const dayDate = new Date(year, month, day);
			const isToday = dayDate.getTime() === today.getTime();
			const isSelected = changeToDate && dayDate.getTime() === changeToDate.getTime();
			
			days.push({
				date: dayDate,
				dayNumber: day,
				isCurrentMonth: true,
				isToday,
				isSelected,
				isPast: dayDate < today
			});
		}
		
		// Add days from next month to fill the grid
		const remainingDays = 42 - days.length; // 6 rows × 7 days
		for (let day = 1; day <= remainingDays; day++) {
			const dayDate = new Date(year, month + 1, day);
			days.push({
				date: dayDate,
				dayNumber: day,
				isCurrentMonth: false,
				isToday: false,
				isSelected: false,
				isPast: dayDate < today
			});
		}
		
		return days;
	}

	async function changeDateTest(entryId: number, newDate: Date, includeFuture: boolean) {
		const response = await fetch('/api/v0/changeDateTest', {
			method: 'PUT',
			body: JSON.stringify({ entryId, newDate, includeFuture }),
			headers: {
				'Content-Type': 'application/json'
			}
		});

		if (response.ok) {
			const data = await response.json();
			return { success: true, body: data };
		}
		return error(response.status, response.statusText);
	}

	async function changeDateSave(
		entryId: number,
		newDate: Date,
		includeFuture: boolean
	): Promise<SaveScheduleResponse> {
		const response = await fetch('/api/v0/changeDateSave', {
			method: 'PUT',
			body: JSON.stringify({ entryId, newDate, includeFuture }),
			headers: {
				'Content-Type': 'application/json'
			}
		});

		if (response.ok) {
			const data = await response.json();
			return data;
		}
		return error(response.status, response.statusText);
	}
</script>


	{#if selectedDay !== null && selectedMonth !== null && selectedYear !== null}
		<button
			class="btn btn-ghost hover:bg-base-100 p-2"
			aria-label="Change date"
			onclick={() => changeDateModal.showModal()}
		>
			<img src={changeDateIcon} alt="change date" width="15" height="15" />
		</button>
		<dialog bind:this={changeDateModal} class="modal">
			<div class="modal-box">
				<h3 class="text-lg font-bold">Move your training</h3>
				<p class="py-4">
					Select a date to which you want to move the training. If there is already a training
					planned for the new date the trainings will be swapped.
				</p>

				<!-- Personal Data Form -->
				<form>
					<fieldset class="fieldset">
						<!-- Custom Month View Date Picker -->
						<div class="custom-date-picker">
							<div class="date-picker-header">
								<button 
									type="button" 
									class="btn btn-sm btn-ghost"
									onclick={() => {
										const newDate = new Date(pickerCurrentDate);
										newDate.setMonth(newDate.getMonth() - 1);
										pickerCurrentDate = newDate;
									}}
								>
									‹
								</button>
								<h4 class="font-semibold">
									{pickerCurrentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
								</h4>
								<button 
									type="button" 
									class="btn btn-sm btn-ghost"
									onclick={() => {
										const newDate = new Date(pickerCurrentDate);
										newDate.setMonth(newDate.getMonth() + 1);
										pickerCurrentDate = newDate;
									}}
								>
									›
								</button>
							</div>
							
							<!-- Days of week header -->
							<div class="date-picker-weekdays">
								{#each ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as day}
									<div class="weekday-header">{day}</div>
								{/each}
							</div>
							
							<!-- Calendar grid -->
							<div class="date-picker-grid">
								{#each generateCalendarDays(pickerCurrentDate) as day}
									<button
										type="button"
										class="date-picker-day"
										class:is-today={day.isToday}
										class:is-selected={day.isSelected}
										class:is-disabled={day.isPast || !day.isCurrentMonth}
										class:is-other-month={!day.isCurrentMonth}
										disabled={day.isPast || !day.isCurrentMonth}
										onclick={() => {
											if (!day.isPast && day.isCurrentMonth) {
												changeToDate = day.date;
											}
										}}
									>
										{day.dayNumber}
									</button>
								{/each}
							</div>
						</div>
						
						<div class="flex justify-end space-x-2 mt-4">
							<button class="btn btn-neutral" type="button" onclick={() => changeDateModal.close()}>
								Close
							</button>
							<button
								class="btn btn-primary"
								type="button"
								onclick={async () => {
									if (changeToDate) {
										saveDateLoading = true;
										await changeDateTest(selectedTraining[0].id, changeToDate!, false)
											.then(async (response) => {
												// Test was successfull, so we can save it
												if (response.success) {
													return await changeDateSave(selectedTraining[0].id, changeToDate!, false);
												}
												// TODO: Ask user if he wants to adapt his goal time
												throw new Error(
													'You cannot reach your goal with this change. I need to implement overriding this.'
												);
											})
											.then(async () => {
												const date = new Date(selectedYear, selectedMonth, selectedDay, 0, 0, 0, 0);
												const apiResponse = await api.getMonthSchedule(date);
												const scheduleResponse = apiResponse.success ? apiResponse.data as Schedule : null;
												schedule = scheduleResponse;

												changeDateModal.close();
												saveDateLoading = false;
												location.reload();
											})
											.catch((error) => {
												console.log(error);
												saveDateLoading = false;
												alert(`Failed to change dates: ${error.error}`);
											});
									}
								}}
							>
								{#if saveDateLoading}
									<svg
										class="mr-3 -ml-1 size-5 animate-spin text-white"
										xmlns="http://www.w3.org/2000/svg"
										fill="none"
										viewBox="0 0 24 24"
										><circle
											class="opacity-25"
											cx="12"
											cy="12"
											r="10"
											stroke="currentColor"
											stroke-width="4"
										></circle><path
											class="opacity-75"
											fill="currentColor"
											d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
										></path></svg
									>
								{:else}
									Change Date
								{/if}
							</button>
						</div>
					</fieldset>
				</form>
			</div>
		</dialog>
	{/if}

<style>
	/* Custom month view date picker styling - dark mode only (matching main calendar) */
	.custom-date-picker {
		border: 1px solid #374151;
		border-radius: 0.5rem;
		padding: 1rem;
		background: #1f2937; /* Always dark background like main calendar */
	}

	.date-picker-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1rem;
	}

	.date-picker-header h4 {
		margin: 0;
		font-size: 1.1rem;
		font-weight: 600;
		color: #f3f4f6; /* Always light text on dark background */
	}

	/* Navigation buttons - dark mode styling only */
	.date-picker-header button {
		color: #f3f4f6; /* Always light text */
		background: transparent;
		border: none;
		padding: 0.5rem;
		border-radius: 0.375rem;
		cursor: pointer;
		transition: color 0.2s ease;
		font-size: 1.25rem;
		font-weight: bold;
		min-width: 2.5rem;
		height: 2.5rem;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.date-picker-header button:hover {
		color: #9ca3af; /* hover:text-gray-400 */
	}

	.date-picker-header button:focus {
		color: #9ca3af; /* focus:text-gray-400 */
		outline: none;
	}

	.date-picker-weekdays {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		gap: 0.25rem;
		margin-bottom: 0.5rem;
	}

	.weekday-header {
		text-align: center;
		font-size: 0.875rem;
		font-weight: 500;
		color: #9ca3af; /* Always grey text */
		padding: 0.5rem 0;
	}

	.date-picker-grid {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		gap: 0.125rem;
	}

	.date-picker-day {
		aspect-ratio: 1;
		border: none;
		background: transparent;
		cursor: pointer;
		border-radius: 0.375rem;
		font-size: 0.875rem;
		color: #f3f4f6; /* Always light text on dark background */
		transition: all 0.2s ease;
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 2.5rem;
	}

	.date-picker-day:hover:not(:disabled) {
		background-color: #374151; /* Dark hover background */
	}

	/* Today styling - grey background (match main calendar) */
	.date-picker-day.is-today {
		background-color: var(--color-today, rgba(75, 85, 99, 0.72)); /* Dark mode today color */
		font-weight: 600;
	}

	/* Selected styling - pink background (match main calendar) */
	.date-picker-day.is-selected {
		background-color: var(--color-secondary, #ec4899);
		color: white;
		font-weight: 600;
	}

	.date-picker-day.is-selected:hover {
		background-color: var(--color-secondary, #ec4899);
		opacity: 0.9;
	}

	/* Disabled (past dates) styling - dark mode */
	.date-picker-day.is-disabled {
		color: #4b5563; /* Dark grey for disabled */
		cursor: not-allowed;
		background: transparent;
	}

	/* Other month days styling - dark mode */
	.date-picker-day.is-other-month {
		color: #4b5563; /* Dark grey for other month days */
	}

	/* Focus state */
	.date-picker-day:focus {
		outline: 2px solid var(--color-secondary, #ec4899);
		outline-offset: 2px;
	}

	/* Enhanced date picker styling (legacy - keeping for fallback) */
	:global(.enhanced-date-picker) {
		position: relative;
	}

	:global(.enhanced-date-picker::-webkit-calendar-picker-indicator) {
		cursor: pointer;
		filter: invert(0.5);
	}

	:global(.dark .enhanced-date-picker::-webkit-calendar-picker-indicator) {
		filter: invert(0.8);
	}

	:global(.enhanced-date-picker::-webkit-datetime-edit-fields-wrapper) {
		padding: 0.5rem;
	}

	:global(.enhanced-date-picker:focus) {
		outline: 2px solid var(--color-secondary, #ec4899);
		outline-offset: 2px;
	}
</style>

