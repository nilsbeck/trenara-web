<script lang="ts">
	import { error } from '@sveltejs/kit';
	import starIcon from '/src/assets/star.svg';
	import type { ScheduledTraining, Entry } from '$lib/server/api/types';

	let giveFeedbackModal: HTMLDialogElement = $state() as HTMLDialogElement;

	let {
		selectedTraining,
		selectedRunTrainingEntry
	}: {
		selectedTraining: ScheduledTraining[];
		selectedRunTrainingEntry: Entry[];
	} = $props();

	let feedbackInitValue: number = $state(
		selectedRunTrainingEntry.length > 0
			? (selectedRunTrainingEntry[0].rpe ?? selectedRunTrainingEntry[0].rpe!)
			: 1
	);

	async function postFeedback(entryId: number, feedback: number) {
		const response = await fetch('/api/v0/feedback', {
			method: 'PUT',
			body: JSON.stringify({ entryId, feedback }),
			headers: {
				'Content-Type': 'application/json'
			}
		});

		if (response.ok) {
			return { success: true, error: null };
		}
		return error(response.status, response.statusText);
	}
</script>

<div>
	{#if selectedRunTrainingEntry.length > 0}
		<div>
			<div class="indicator">
				{#if selectedRunTrainingEntry[0].rpe != null}
					<span class="indicator-item badge badge-secondary">{selectedRunTrainingEntry[0].rpe}</span
					>
				{/if}
				{#if selectedTraining[0].can_be_edited}
					<button
						class="btn btn-ghost hover:bg-base-100"
						aria-label="Give feedback"
						onclick={() => giveFeedbackModal.showModal()}
					>
						<img src={starIcon} alt="give feedback" width="16" height="16" />
					</button>
				{/if}
			</div>
			<dialog bind:this={giveFeedbackModal} class="modal">
				<div class="modal-box">
					<h3 class="text-lg font-bold">Give feedback</h3>
					<p class="py-4">Use the slider to give feedback about the training.</p>

					<!-- Personal Data Form -->
					<form class="flex justify-center w-full">
						<fieldset class="fieldset w-full">
							<legend class="fieldset-legend">Give feedback:</legend>
							<div class="w-full">
								<input
									type="range"
									min="1"
									max="10"
									bind:value={feedbackInitValue}
									class="range w-full"
									step="1"
								/>
								<div class="flex justify-between px-2.5 mt-2 text-xs">
									<span>|</span>
									<span>|</span>
									<span>|</span>
									<span>|</span>
									<span>|</span>
									<span>|</span>
									<span>|</span>
									<span>|</span>
									<span>|</span>
									<span>|</span>
								</div>
								<div class="flex justify-between px-2.5 mt-2 text-xs">
									<span>1</span>
									<span>2</span>
									<span>3</span>
									<span>4</span>
									<span>5</span>
									<span>6</span>
									<span>7</span>
									<span>8</span>
									<span>9</span>
									<span>10</span>
								</div>
							</div>
							<div class="flex justify-end space-x-2">
								<button
									class="btn btn-neutral"
									type="button"
									onclick={() => giveFeedbackModal.close()}
								>
									Close
								</button>
								<button
									class="btn btn-primary"
									type="submit"
									onclick={async () => {
										await postFeedback(selectedRunTrainingEntry[0].id, feedbackInitValue)
											.then(() => {
												selectedRunTrainingEntry[0].rpe = feedbackInitValue;
												giveFeedbackModal.close();
											})
											.catch((error) => alert(`Failed to save feedback: ${error.error}`));
									}}>Save</button
								>
							</div>
						</fieldset>
					</form>
				</div>
			</dialog>
		</div>
	{/if}
</div>
