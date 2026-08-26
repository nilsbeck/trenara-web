<script lang="ts">
	import type { Entry } from '$lib/server/trenara/types';
	import { Loader2, Star } from 'lucide-svelte';
	import RpeSlider from '$lib/components/training/rpe-slider.svelte';
	import { rpeColors } from '$lib/components/training/rpe';
	import { DROPPED_MESSAGE, rateEntry } from '$lib/api/rate-entry';

	let {
		entry,
		onRated
	}: {
		entry: Entry;
		/** The rating went in; the schedule on screen is a read behind. */
		onRated?: () => void;
	} = $props();

	let rpeValue = $state(5);
	let submitting = $state(false);
	let error = $state<string | null>(null);

	const currentColor = $derived(rpeColors[rpeValue - 1]);

	async function handleSubmit() {
		submitting = true;
		error = null;

		try {
			const outcome = await rateEntry(entry.id, rpeValue);

			if (outcome.status === 'dropped') {
				error = DROPPED_MESSAGE;
				return;
			}

			// Written back only where the API confirmed it; anything else is left
			// for the refresh `onRated` asks for to settle. A rating this card
			// invents on the strength of a 2xx is what hid a dropped one until
			// the next reload.
			if (outcome.status === 'stored') {
				entry.rpe = outcome.rpe;
			}

			onRated?.();
		} catch (e) {
			error = e instanceof Error ? e.message : 'An unexpected error occurred';
		} finally {
			submitting = false;
		}
	}
</script>

<div class="rounded-lg border border-border bg-card p-4">
	<div class="flex items-center gap-2 mb-3">
		<Star class="h-4 w-4 text-amber-500" />
		<h4 class="text-sm font-semibold text-foreground">How did this training feel?</h4>
	</div>

	<RpeSlider bind:value={rpeValue} />

	{#if error}
		<p class="mt-3 text-sm text-destructive">{error}</p>
	{/if}

	<!-- Submit -->
	<button
		type="button"
		disabled={submitting}
		onclick={handleSubmit}
		class="mt-4 w-full inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 transition-all duration-200"
		style="background-color: {currentColor};"
	>
		{#if submitting}
			<Loader2 class="h-4 w-4 animate-spin" />
			Saving...
		{:else}
			Rate training
		{/if}
	</button>
</div>
