<script lang="ts">
	import { Plus, X } from 'lucide-svelte';

	let dialogEl: HTMLDialogElement | undefined = $state();

	let trainingType = $state<'run' | 'bike'>('run');
	let name = $state('');
	let date = $state(new Date().toISOString().split('T')[0]);
	let hours = $state(0);
	let minutes = $state(0);
	let seconds = $state(0);
	let distance = $state(0);
	let submitting = $state(false);
	let error = $state<string | null>(null);

	const timeInSeconds = $derived(hours * 3600 + minutes * 60 + seconds);
	const distanceInKm = $derived(
		trainingType === 'bike' ? (timeInSeconds / 3600) * distance * 2.5 : distance
	);

	function open() {
		resetForm();
		dialogEl?.showModal();
	}

	function close() {
		dialogEl?.close();
	}

	function resetForm() {
		trainingType = 'run';
		name = '';
		date = new Date().toISOString().split('T')[0];
		hours = 0;
		minutes = 0;
		seconds = 0;
		distance = 0;
		error = null;
	}

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();

		if (!name.trim()) {
			error = 'Name is required';
			return;
		}
		if (timeInSeconds <= 0) {
			error = 'Duration must be greater than zero';
			return;
		}
		if (distanceInKm <= 0) {
			error = 'Distance must be greater than zero';
			return;
		}

		submitting = true;
		error = null;

		try {
			const res = await fetch('/api/v1/training/add', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name: name.trim(),
					timeInSeconds,
					date,
					distanceInKm
				})
			});

			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				throw new Error(data.message || 'Failed to add training');
			}

			close();
		} catch (e) {
			error = e instanceof Error ? e.message : 'An error occurred';
		} finally {
			submitting = false;
		}
	}
</script>

<button
	type="button"
	onclick={open}
	class="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
>
	<Plus class="h-4 w-4" />
	Add Training
</button>

<dialog
	bind:this={dialogEl}
	class="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md rounded-lg border border-border bg-card p-0 shadow-xl backdrop:bg-black/50"
	onclick={(e) => { if (e.target === dialogEl) close(); }}
>
	<div class="p-6">
		<!-- Header -->
		<div class="flex items-center justify-between mb-6">
			<h2 class="text-lg font-semibold text-card-foreground">Add Training</h2>
			<button
				type="button"
				onclick={close}
				class="rounded-md p-1 text-muted-foreground hover:text-card-foreground"
			>
				<X class="h-5 w-5" />
			</button>
		</div>

		<form onsubmit={handleSubmit} class="space-y-4">
			<!-- Training type toggle -->
			<fieldset>
				<legend class="mb-1.5 text-sm font-medium text-card-foreground">Type</legend>
				<div class="flex rounded-md border border-border overflow-hidden">
					<label
						class="flex-1 cursor-pointer text-center py-2 text-sm font-medium transition-colors {trainingType === 'run'
							? 'bg-primary text-primary-foreground'
							: 'bg-card text-muted-foreground hover:bg-muted/50'}"
					>
						<input
							type="radio"
							name="trainingType"
							value="run"
							bind:group={trainingType}
							class="sr-only"
						/>
						Run
					</label>
					<label
						class="flex-1 cursor-pointer text-center py-2 text-sm font-medium transition-colors border-l border-border {trainingType === 'bike'
							? 'bg-primary text-primary-foreground'
							: 'bg-card text-muted-foreground hover:bg-muted/50'}"
					>
						<input
							type="radio"
							name="trainingType"
							value="bike"
							bind:group={trainingType}
							class="sr-only"
						/>
						Bike
					</label>
				</div>
			</fieldset>

			<!-- Name -->
			<div>
				<label for="training-name" class="mb-1.5 block text-sm font-medium text-card-foreground">
					Name
				</label>
				<input
					id="training-name"
					type="text"
					bind:value={name}
					placeholder="e.g. Morning Run"
					class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
				/>
			</div>

			<!-- Date -->
			<div>
				<label for="training-date" class="mb-1.5 block text-sm font-medium text-card-foreground">
					Date
				</label>
				<input
					id="training-date"
					type="date"
					bind:value={date}
					class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
				/>
			</div>

			<!-- Duration -->
			<div>
				<p class="mb-1.5 block text-sm font-medium text-card-foreground">Duration</p>
				<div class="grid grid-cols-3 gap-2">
					<div>
						<label for="training-hours" class="mb-1 block text-xs text-muted-foreground">
							Hours
						</label>
						<input
							id="training-hours"
							type="number"
							min="0"
							max="23"
							bind:value={hours}
							class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
						/>
					</div>
					<div>
						<label for="training-minutes" class="mb-1 block text-xs text-muted-foreground">
							Minutes
						</label>
						<input
							id="training-minutes"
							type="number"
							min="0"
							max="59"
							bind:value={minutes}
							class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
						/>
					</div>
					<div>
						<label for="training-seconds" class="mb-1 block text-xs text-muted-foreground">
							Seconds
						</label>
						<input
							id="training-seconds"
							type="number"
							min="0"
							max="59"
							bind:value={seconds}
							class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
						/>
					</div>
				</div>
			</div>

			<!-- Distance / Pace -->
			{#if trainingType === 'run'}
				<div>
					<label
						for="training-distance"
						class="mb-1.5 block text-sm font-medium text-card-foreground"
					>
						Distance (km)
					</label>
					<input
						id="training-distance"
						type="number"
						min="0"
						step="0.01"
						bind:value={distance}
						placeholder="0.00"
						class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
					/>
				</div>
			{:else}
				<div>
					<label
						for="training-pace"
						class="mb-1.5 block text-sm font-medium text-card-foreground"
					>
						Average Speed (km/h)
					</label>
					<input
						id="training-pace"
						type="number"
						min="0"
						step="0.1"
						bind:value={distance}
						placeholder="0.0"
						class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
					/>
					<p class="mt-1 text-xs text-muted-foreground">
						Equivalent distance: {distanceInKm.toFixed(2)} km (2.5x factor)
					</p>
				</div>
			{/if}

			<!-- Error -->
			{#if error}
				<p class="text-sm text-destructive">{error}</p>
			{/if}

			<!-- Actions -->
			<div class="flex items-center justify-end gap-3 pt-2">
				<button
					type="button"
					onclick={close}
					class="rounded-md px-4 py-2 text-sm font-medium text-muted-foreground hover:text-card-foreground transition-colors"
				>
					Cancel
				</button>
				<button
					type="submit"
					disabled={submitting}
					class="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
				>
					{#if submitting}
						Saving...
					{:else}
						Save Training
					{/if}
				</button>
			</div>
		</form>
	</div>
</dialog>
