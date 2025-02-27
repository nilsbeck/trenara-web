<script lang="ts">
	import type { ScheduledTraining, Entry } from '$lib/server/api/types';
    import changeDateIcon from '/src/assets/change-date.svg';
	import changeSurfaceIcon from '/src/assets/change-surface.svg';
	import trashIcon from '/src/assets/trash.svg';

    let my_modal_1: HTMLDialogElement = $state() as HTMLDialogElement;

	let {
		selectedTraining,
		selectedRunTrainingEntry,
        selectedDay,
        selectedMonth,
        selectedYear,
        selectedDate
	}: { 
        selectedTraining: ScheduledTraining[], 
        selectedRunTrainingEntry: Entry[], 
        selectedDay: number | null, 
        selectedMonth: number | null, 
        selectedYear: number | null, 
        selectedDate: string | null 
    } = $props();
</script>

{#if selectedTraining[0]}
	<div class="md:py-4 dark:bg-gray-700 bg-gray-50 rounded-b-xl w-full">
		<div class="px-0">
			<div class=" border-gray-400">
				<div>
					<div class="flex justify-between items-center">
						<h2 class="card-title text-left">
							{selectedTraining[0].title}
							{#if selectedRunTrainingEntry.length > 0}
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="size-6 inline-block text-success"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
									><path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="4"
										d="M5 13l4 4L19 7"
									/></svg
								>
							{/if}
						</h2>
						{#if selectedTraining[0].can_be_edited}
							<div class="flex items-center space-x-4">
								<button
									aria-label="Change surface"
									class="icon-button"
									style="background: transparent;"
								>
									<img src={changeSurfaceIcon} alt="change surface" width="22" height="22" />
								</button>
								{@render changeDateDialogSnippet()}
								<button aria-label="Delete training" class="icon-button">
									<img src={trashIcon} alt="delete training" width="16" height="16" />
								</button>
							</div>
						{/if}
					</div>
				</div>
				<p class="text-sm pt-2 mt-2 leading-4">
					{selectedTraining[0].description}
				</p>
				{#if selectedRunTrainingEntry.length > 0}
					<p class="text-sm pt-2 mt-2 leading-4">
						{selectedRunTrainingEntry[0].notification?.content}
					</p>
				{/if}
				<ul class="mt-6 flex flex-col gap-2 text-sm">
					{#each selectedTraining[0].training.blocks as block}
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
					<table class="table w-full text-sm">
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
								<td class="text-left">{selectedTraining[0].training.total_distance}</td>
								{#if selectedRunTrainingEntry.length > 0}
									<td class="text-left">{selectedRunTrainingEntry[0].distance}</td>
								{/if}
							</tr>
							<tr>
								<td class="text-left">Core</td>
								<td class="text-left">{selectedTraining[0].training.core_distance}</td>
								{#if selectedRunTrainingEntry}
									<td class="text-left">-</td>
								{/if}
							</tr>
							<tr>
								<td class="text-left">Time</td>
								<td class="text-left">{selectedTraining[0].training.total_time}</td>
								{#if selectedRunTrainingEntry}
									<td class="text-left">{selectedRunTrainingEntry[0].time}</td>
								{/if}
							</tr>
							<tr>
								<td class="text-left">Heartrate</td>
								<td class="text-left">-</td>
								{#if selectedRunTrainingEntry}
									<td class="text-left">{selectedRunTrainingEntry[0].avg_heartbeat}</td>
								{/if}
							</tr>
							<tr>
								<td class="text-left">Elevation</td>
								<td class="text-left">-</td>
								{#if selectedRunTrainingEntry}
									<td class="text-left">{selectedRunTrainingEntry[0].total_altitude}</td>
								{/if}
							</tr>
						</tbody>
					</table>
				</div>
			</div>
		</div>
	</div>
{:else}
	<div class="md:py-8 py-5 dark:bg-gray-700 bg-gray-50 rounded-b-xl w-full">
		<div class="px-4">
			<div class=" border-gray-400 flex">
				{#if selectedDate}
					<p class="text-m pt-2 mt-2 leading-4 text-center">
						No training scheduled for this day. Time to rest! 😴​
					</p>
				{:else}
					<p class="text-m pt-2 mt-2 leading-4 text-center">
						Please select a date to see the training details.​
					</p>
				{/if}
			</div>
		</div>
	</div>
{/if}


{#snippet listItem(text: string)}
	<span>• {text}</span>
{/snippet}

{#snippet changeDateDialogSnippet()}
	{#if selectedDay && selectedMonth && selectedYear}
		<button class="btn btn-ghost hover:bg-base-100" aria-label="Change date" onclick={() => my_modal_1.showModal()}>
			<img src={changeDateIcon} alt="change date" width="16" height="16" />
		</button>
		<dialog bind:this={my_modal_1} class="modal">
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
							<span class="label">From:</span>
							<input
								type="date"
								name="fromDate"
								placeholder="From Date"
								required
								class="input"
								value={selectedDate}
							/>
						</label>
						<label class="input">
							<span class="label">To:</span>
							<input type="date" name="toDate" placeholder="To Date" required class="input" />
						</label>
						<button class="btn" type="button" onclick={() => my_modal_1.close()}>Close</button>
						<button class="btn" type="submit">Change Date</button>
					</fieldset>
				</form>
			</div>
		</dialog>
	{/if}
{/snippet}
