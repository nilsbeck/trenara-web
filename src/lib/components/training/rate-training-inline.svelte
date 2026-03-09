<script lang="ts">
	import type { Entry } from '$lib/server/trenara/types';
	import { Loader2, Star } from 'lucide-svelte';
	import RpeSlider from '$lib/components/training/rpe-slider.svelte';
	import { rpeColors } from '$lib/components/training/rpe';

	let {
		entry,
		onRated
	}: {
		entry: Entry;
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
