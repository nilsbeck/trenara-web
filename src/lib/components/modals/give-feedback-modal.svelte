<script lang="ts">
	import type { ScheduledTraining, Entry } from '$lib/server/trenara/types';
	import { Star, X, Loader2 } from 'lucide-svelte';

	let {
		training,
		entry
	}: {
		training: ScheduledTraining;
		entry: Entry;
	} = $props();

	let dialogEl: HTMLDialogElement | undefined = $state();
	// Initialise to 5; the open() function always resets to the current entry.rpe
	// before showing the dialog, so we never read entry at state-init time.
	let rpeValue = $state(5);
	let submitting = $state(false);
	let error = $state<string | null>(null);

	const rpeData = [
		{ title: 'Very light', description: 'Hardly any exertion, but more than sleeping or watching TV. Almost no muscle strain, just a very easy movement.' },
		{ title: 'Light', description: 'Feels like you can maintain this for hours. Easy to breathe and carry a conversation. Muscles feel relaxed with minimal strain, i.e., a recovery or LSD run.' },
		{ title: 'Light', description: 'Feels like you can maintain this for hours. Easy to breathe and carry a conversation. Muscles feel slightly engaged but not straining, i.e., a recovery or LSD run.' },
		{ title: 'Moderate', description: 'Breathing heavily, can hold a short conversation. Muscles start to feel some strain but still somewhat comfortable. Becoming noticeably challenging, i.e. an extensive interval or tempo session.' },
		{ title: 'Moderate', description: 'Breathing heavily, can hold a short conversation. Muscles are working harder and feeling some fatigue but still manageable. Becoming noticeably challenging, i.e. an extensive interval or tempo session.' },
		{ title: 'Moderate', description: 'Breathing heavily, can hold a short conversation. Muscles are working significantly, starting to feel fatigue and burn, i.e. an extensive interval or tempo session.' },
		{ title: 'Vigorous', description: 'Borderline uncomfortable. Short of breath, can speak a sentence. Muscles feel increasingly strained and tired but you can still push through, i.e. most tempo runs and intervals.' },
		{ title: 'Vigorous', description: 'Borderline uncomfortable. Short of breath, can speak a sentence. Muscles are burning and it is harder to maintain pace, i.e. most tempo runs and intervals.' },
		{ title: 'Very hard', description: 'Very difficult to maintain exercise intensity. Can barely breathe and speak only a few words. Muscles are near failure, feeling intense fatigue and strain, i.e. fast intervals.' },
		{ title: 'Max effort', description: "Feels almost impossible to keep going. Completely out of breath, unable to talk. Muscles are screaming with fatigue and you can't push any harder. Can only maintain for a very short time, i.e. very hard intervals with a high pace and little recovery time." }
	];

	const rpeColors = [
		'#22c55e', // 1 - green
		'#84cc16', // 2 - lime
		'#a3e635', // 3 - yellow-green
		'#eab308', // 4 - yellow
		'#f59e0b', // 5 - amber
		'#f97316', // 6 - orange
		'#ef4444', // 7 - red
		'#dc2626', // 8 - red-600
		'#b91c1c', // 9 - red-700
		'#7f1d1d'  // 10 - red-900
	];

	const currentRpe = $derived(rpeData[rpeValue - 1]);
	const currentColor = $derived(rpeColors[rpeValue - 1]);

	function open() {
		rpeValue = entry.rpe ?? 5;
		error = null;
		dialogEl?.showModal();
	}

	function close() {
		dialogEl?.close();
	}

	async function handleSubmit() {
		submitting = true;
		error = null;

		try {
			const res = await fetch('/api/v1/feedback', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ entryId: entry.id, feedback: rpeValue })
			});

			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				throw new Error(data.message ?? `Failed to save feedback (${res.status})`);
			}

			entry.rpe = rpeValue;
			close();
		} catch (e) {
			error = e instanceof Error ? e.message : 'An unexpected error occurred';
		} finally {
			submitting = false;
		}
	}
</script>

<button
	type="button"
	onclick={open}
	class="relative rounded-md p-2.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
	aria-label="Give feedback"
>
	<Star class="h-5 w-5" />
	{#if entry.rpe != null}
		<span
			class="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-0.5 text-[10px] font-medium text-primary-foreground"
		>
			{entry.rpe}
		</span>
	{/if}
</button>

<dialog
	bind:this={dialogEl}
	class="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md rounded-lg border border-border bg-card p-0 shadow-xl backdrop:bg-black/50"
	onclick={(e) => { if (e.target === dialogEl) close(); }}
>
	<div class="p-6">
		<div class="flex items-center justify-between mb-4">
			<h2 class="text-lg font-semibold text-card-foreground">Rate Perceived Exertion</h2>
			<button
				type="button"
				onclick={close}
				class="rounded-md p-1 text-muted-foreground hover:text-card-foreground"
			>
				<X class="h-5 w-5" />
			</button>
		</div>

		<div class="mb-6">
			<!-- Dynamic title above the slider -->
			<div class="mb-3 text-center">
				<span
					class="text-base font-semibold transition-colors duration-200"
					style="color: {currentColor}"
				>
					{rpeValue} – {currentRpe.title}
				</span>
			</div>

			<!-- Slider -->
			<div class="relative">
				<input
					type="range"
					min="1"
					max="10"
					step="1"
					bind:value={rpeValue}
					class="rpe-slider w-full h-2 rounded-full appearance-none cursor-pointer transition-all duration-200"
					style="--rpe-color: {currentColor};"
				/>
				<div class="flex justify-between mt-1.5 text-xs text-muted-foreground">
					{#each Array.from({ length: 10 }, (_, i) => i + 1) as n}
						<span
							class="w-5 text-center transition-all duration-150"
							style={n === rpeValue ? `color: ${currentColor}; font-weight: 600;` : ''}
						>{n}</span>
					{/each}
				</div>
			</div>

			<!-- Dynamic description below the slider -->
			<div
				class="mt-4 rounded-md px-3 py-2.5 text-sm text-muted-foreground transition-all duration-200"
				style="background-color: {currentColor}18; border-left: 3px solid {currentColor};"
			>
				{currentRpe.description}
			</div>
		</div>

		{#if error}
			<p class="mb-4 text-sm text-destructive">{error}</p>
		{/if}

		<div class="flex items-center justify-end gap-3">
			<button
				type="button"
				onclick={close}
				class="rounded-md px-4 py-2 text-sm font-medium text-muted-foreground hover:text-card-foreground transition-colors"
			>
				Cancel
			</button>
			<button
				type="button"
				disabled={submitting}
				onclick={handleSubmit}
				class="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 transition-all duration-200"
				style="background-color: {currentColor};"
			>
				{#if submitting}
					<Loader2 class="h-4 w-4 animate-spin" />
					Saving...
				{:else}
					Save
				{/if}
			</button>
		</div>
	</div>
</dialog>

<style>
	/* Track */
	.rpe-slider::-webkit-slider-runnable-track {
		height: 8px;
		border-radius: 9999px;
		background: color-mix(in srgb, var(--rpe-color) 25%, transparent);
	}
	.rpe-slider::-moz-range-track {
		height: 8px;
		border-radius: 9999px;
		background: color-mix(in srgb, var(--rpe-color) 25%, transparent);
	}

	/* Thumb */
	.rpe-slider::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		width: 20px;
		height: 20px;
		border-radius: 50%;
		background: var(--rpe-color);
		border: 2px solid white;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
		margin-top: -6px;
		cursor: pointer;
	}
	.rpe-slider::-moz-range-thumb {
		width: 20px;
		height: 20px;
		border-radius: 50%;
		background: var(--rpe-color);
		border: 2px solid white;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
		cursor: pointer;
	}
</style>
