<script lang="ts">
	import { error } from '@sveltejs/kit';
	import changeDateIcon from '/src/assets/change-date.svg';
	import type { Schedule, ScheduledTraining, SaveScheduleResponse } from '$lib/server/api';
	import { api } from '$lib/utils/api-client.js';

	let changeDateModal: HTMLDialogElement = $state() as HTMLDialogElement;
	let saveDateLoading: boolean = $state(false);
	let changeToDate: Date | null = $state(null);

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


	{#if selectedDay && selectedMonth && selectedYear}
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
						<legend class="fieldset-legend">Change dates:</legend>
						<label class="input">
							<span class="label">To:</span>
							<input
								type="date"
								name="toDate"
								placeholder="To Date"
								bind:value={changeToDate}
								required
							/>
						</label>
						<div class="flex justify-end space-x-2">
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

