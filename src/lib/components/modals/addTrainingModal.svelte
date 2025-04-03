<script lang="ts">
	import { error } from '@sveltejs/kit';
	let addTrainingModal: HTMLDialogElement = $state() as HTMLDialogElement;
	let inputDistanceInKm: number = $state(1);
	let trainingName: string = $state('Training');
	let trainingDate: string = $state(new Date(new Date().setHours(0, 0, 0, 0)).toISOString().split('T')[0]);

	let hours: number = $state(0);
	let minutes: number = $state(0);
	let seconds: number = $state(0);
	let paceMin: number = $state(5);
	let paceSeconds: number = $state(0);
	let selectedActivity: 'run' | 'bike' = $state('run');
	let timeInSeconds: number = $derived(
		selectedActivity === 'run'
			? hours * 60 * 60 + minutes * 60 + seconds
			: (hours * 60 * 60 + minutes * 60 + seconds) / 2.5
	);
	let paceTime: number = $derived(paceMin + paceSeconds / 60);

	let distanceInKm: number = $derived(
		selectedActivity === 'run' ? inputDistanceInKm : timeInSeconds / 60 / paceTime
	);

	async function addTraining(
		name: string,
		timeInSeconds: number,
		date: string,
		distanceInKm: number
	) {
		const utcDate: string = new Date(date + 'T00:00:00.000Z').toISOString();
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
					<div class="flex flex-row">
						<label class="input">
							<input
								type="radio"
								id="run"
								name="radio-1"
								class="radio"
								checked={selectedActivity === 'run'}
								onchange={() => (selectedActivity = 'run')}
							/>
							🏃‍♀️‍➡️ Running
						</label>
						<label class="input">
							<input
								type="radio"
								id="bike"
								name="radio-1"
								class="radio"
								checked={selectedActivity === 'bike'}
								onchange={() => (selectedActivity = 'bike')}
							/>
							🚴‍♀️ Bike
						</label>
					</div>
					{#if selectedActivity == 'bike'}
						<p>
							This will adapt the bike time by factor 2.5 and distance recalculate distance with an
							average speed of 20km/h to convert it to a run activity. See this
							<a
								href="https://www.trenara.com/blog/alternative-training-for-runners-practical-guide"
								class="link link-primary"
								target="_blank">link</a
							> for more details.
						</p>
					{/if}
					<label class="input">
						<span class="label">Name:</span>
						<input type="text" min="1" required bind:value={trainingName} step="1" />
					</label>
					<label class="input">
						<span class="label">Date:</span>
						<input type="date" required bind:value={trainingDate}/>
					</label>
					<div class="flex flex-row space-x-2">
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
					{#if selectedActivity == 'bike'}
						<div class="flex flex-row space-x-2">
							Targeted run pace:
							<label class="input">
								<span class="label">Min:</span>
								<input type="number" min="1" required bind:value={paceMin} step="1" />
							</label>
							<label class="input">
								<span class="label">Seconds:</span>
								<input type="number" min="1" required bind:value={paceSeconds} step="1" />
							</label>
						</div>
					{/if}
					{#if selectedActivity == 'run'}
						<label class="input">
							<span class="label">Distance [km]:</span>
							<input type="number" min="1" required bind:value={inputDistanceInKm} step="1" />
						</label>
					{/if}

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
