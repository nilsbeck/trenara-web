<script lang="ts">
	import { error } from '@sveltejs/kit';
	let addTrainingModal: HTMLDialogElement = $state() as HTMLDialogElement;
	let distanceInKm: number = $state(1);
	let trainingName: string = $state('');
	let trainingDate: Date = $state(new Date(new Date().setHours(0, 0, 0, 0)));

	let hours: number = $state(0);
	let minutes: number = $state(0);
	let seconds: number = $state(0);
	let timeInSeconds: number = $derived(hours * 60 * 60 + minutes * 60 + seconds);

	async function addTraining(
		name: string,
		timeInSeconds: number,
		date: Date,
		distanceInKm: number
	) {
		const utcDate: string = new Date(date).toISOString();
		const response = await fetch('/api/v0/addTraining', {
			method: 'POST',
			body: JSON.stringify({ name, timeInSeconds, date: utcDate, distanceInKm }),
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
</script>

<div>
	<button
		class="btn btn-neutral"
		type="button"
		onclick={async () => {
			addTrainingModal.showModal();
		}}
		>Add Training
	</button>
	<dialog bind:this={addTrainingModal} class="modal">
		<div class="modal-box">
			<h3 class="text-lg font-bold">Add training</h3>
			<div class="flex flex-col"></div>
			<!-- Personal Data Form -->
			<form>
				<fieldset class="fieldset">
					<label class="input">
						<span class="label">Name:</span>
						<input type="text" min="1" required bind:value={trainingName} step="1" />
					</label>
					<label class="input">
						<span class="label">Date:</span>
						<input type="date"required bind:value={trainingDate}  />
					</label>
					<div class="flex flex-row">
						<label class="input">
							<span class="label">Hours:</span>
							<input type="number" min="0" max="24" required bind:value={hours} step="1" />
						</label>
						<label class="input">
							<span class="label">Minutes:</span>
							<input type="number" min="0" max="59" required bind:value={minutes} step="1" />
						</label>
						<label class="input">
							<span class="label">Seconds:</span>
							<input type="number" min="0" max="59" required bind:value={seconds} step="1" />
						</label>
					</div>
					<label class="input">
						<span class="label">Distance [km]:</span>
						<input type="distance" min="1" required bind:value={distanceInKm} step="1" />
					</label>

					<div class="flex justify-end space-x-2">
						<button class="btn btn-neutral" type="button" onclick={() => addTrainingModal.close()}>
							Close
						</button>
						<button
							class="btn btn-primary"
							type="button"
							onclick={async () => {
								await addTraining(trainingName, timeInSeconds, trainingDate, distanceInKm)
									.then(() => {
										addTrainingModal.close();
									})
									.catch((error) => alert(`Failed to add training: ${error.error}`));
							}}>Save</button
						>
					</div>
				</fieldset>
			</form>
		</div>
	</dialog>
</div>
