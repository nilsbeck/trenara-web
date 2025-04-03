<script lang="ts">
	import type { ScheduledTraining, Entry, Schedule } from '$lib/server/api/types';
	import { getMonthScheduleData } from './utils';

	import changeSurfaceIcon from '/src/assets/change-surface.svg';
	import trashIcon from '/src/assets/trash.svg';
	import coachIcon from '/src/assets/img__coach.jpeg';
	import ChangeDate from '../modals/changeDateModal.svelte';
	import GiveFeedbackModal from '../modals/giveFeedbackModal.svelte';
	import Loading from '../loading.svelte';

	let isDeleting = $state(false);

	let {
		schedule = $bindable(),
		selectedTraining,
		selectedRunTrainingEntry,
		selectedDay,
		selectedMonth,
		selectedYear,
		selectedDate
	}: {
		schedule: Schedule;
		selectedTraining: ScheduledTraining[];
		selectedRunTrainingEntry: Entry[];
		selectedDay: number | null;
		selectedMonth: number | null;
		selectedYear: number | null;
		selectedDate: string | null;
	} = $props();
</script>

{#if selectedTraining.length > 0 || (selectedRunTrainingEntry && selectedRunTrainingEntry[0])}
	<div class="py-4 dark:bg-gray-700 bg-gray-50 rounded-b-xl w-full">
		<div class=" border-gray-400">
			<div>
				<div class="flex justify-between items-center">
					<h2 class="card-title text-left">
						{#if selectedRunTrainingEntry && selectedRunTrainingEntry.length > 0}
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
						{#if selectedRunTrainingEntry.length > 0}
							{selectedRunTrainingEntry[0].name} {#if selectedTraining.length > 0}{@render timeDistance(selectedTraining)}{/if}
						{:else if selectedTraining.length > 0}
							{selectedTraining[0].title} {@render timeDistance(selectedTraining)}
						{/if}
					</h2>
					<div class="flex items-right space-x-4">
						{#if selectedRunTrainingEntry.length > 0 && selectedTraining.length > 0}
							<GiveFeedbackModal {selectedTraining} {selectedRunTrainingEntry} />
						{/if}
						{#if selectedTraining.length > 0 && selectedTraining[0].can_be_edited}
							<button
								aria-label="Change surface"
								class="icon-button btn btn-ghost hover:bg-base-100"
								style="background: transparent;"
							>
								<img src={changeSurfaceIcon} alt="change surface" width="22" height="22" />
							</button>
							<ChangeDate
								{schedule}
								{selectedDay}
								{selectedMonth}
								{selectedYear}
								{selectedTraining}
							/>
						{/if}
						{#if selectedYear != null && selectedMonth != null && selectedDay != null && selectedRunTrainingEntry}
							<button
								aria-label="Delete training"
								class="icon-button btn btn-ghost hover:bg-base-100"
								onclick={async () => {
									if (!confirm('Are you sure you want to delete this training?')) {
										return;
									}
									isDeleting = true;
									
									const response = await fetch('/api/v0/deleteTraining', {
										method: 'DELETE',
										body: JSON.stringify({trainingId: selectedRunTrainingEntry[0].id}),
										headers: {
											'Content-Type': 'application/json'
										}
									});

									if (response.ok) {
										const date = new Date(selectedYear, selectedMonth, selectedDay, 0, 0, 0, 0);
										const scheduleResponse = (await getMonthScheduleData(date)) as Schedule;
										schedule = scheduleResponse;
									} else {
										alert(response.statusText);
									}
									isDeleting = false;
								}}
							>
								{#if isDeleting}
									<Loading text="" />
								{:else}
									<img src={trashIcon} alt="delete training" width="16" height="16" />
								{/if}
							</button>
						{/if}
					</div>
				</div>
			</div>
			{#if selectedTraining.length > 0}
				<div class="chat chat-start w-full">
					<div class="chat-image avatar">
						<div class="w-10 rounded-full">
							<img alt="Our coach" src={coachIcon} />
						</div>
					</div>
					<div class="chat-start py-2 w-full">
						<div class="chat-bubble dark:bg-gray-800 bg-white w-full">
							<p class="text-sm">{selectedTraining[0].description}</p>
						</div>
					</div>
					{#if selectedRunTrainingEntry && selectedRunTrainingEntry.length > 0}
						<div class="chat-bubble dark:bg-gray-800 bg-white w-full">
							<p class="text-sm">
								{selectedRunTrainingEntry[0].notification?.content}
							</p>
						</div>
					{/if}
				</div>
				<div class="card mt-4 dark:bg-gray-800 bg-white">
					<ul class="m-4 flex flex-col gap-2 text-sm">
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
				</div>
			{/if}
			<div class="card mt-4 dark:bg-gray-800 bg-white">
				<div class="m-2">
					<table class="table w-full text-sm">
						<thead>
							<tr>
								<th class="text-left">Metric</th>
								{#if selectedTraining.length > 0}
									<th class="text-left">Plan</th>
								{/if}
								{#if selectedRunTrainingEntry.length > 0}
									<th class="text-left">Actual</th>
								{/if}
							</tr>
						</thead>
						<tbody>
							<tr>
								<td class="text-left">Total Distance</td>
								{#if selectedTraining.length > 0}
									<td class="text-left">{selectedTraining[0].training.total_distance}</td>
								{/if}
								{#if selectedRunTrainingEntry.length > 0}
									<td class="text-left">{selectedRunTrainingEntry[0].distance}</td>
								{/if}
							</tr>
							<tr>
								<td class="text-left">Core</td>
								{#if selectedTraining.length > 0}
									<td class="text-left">{selectedTraining[0].training.core_distance}</td>
								{/if}
								{#if selectedRunTrainingEntry.length > 0}
									<td class="text-left">-</td>
								{/if}
							</tr>
							<tr>
								<td class="text-left">Time</td>
								{#if selectedTraining.length > 0}
									<td class="text-left">{selectedTraining[0].training.total_time}</td>
								{/if}
								{#if selectedRunTrainingEntry.length > 0}
									<td class="text-left">{selectedRunTrainingEntry[0].time}</td>
								{/if}
							</tr>
							<tr>
								<td class="text-left">Heartrate</td>
								{#if selectedTraining.length > 0}
									<td class="text-left">-</td>
								{/if}
								{#if selectedRunTrainingEntry.length > 0}
									<td class="text-left">{selectedRunTrainingEntry[0].avg_heartbeat}</td>
								{/if}
							</tr>
							<tr>
								<td class="text-left">Elevation</td>
								{#if selectedTraining.length > 0}
									<td class="text-left">-</td>
								{/if}
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
{:else}
	<div class="md:py-8 py-5 dark:bg-gray-700 bg-gray-50 rounded-b-xl w-full">
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
{/if}

{#snippet listItem(text: string)}
	<span>• {text}</span>
{/snippet}

{#snippet timeDistance(selectedTraining: ScheduledTraining[])}
<span class="text-[10px]">[{selectedTraining[0].training.total_distance}, {selectedTraining[0].training.total_time}{selectedTraining[0].training.total_time.split(':').length == 2 ? 'min' : 'h'}]</span>
{/snippet}
