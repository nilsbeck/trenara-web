<script lang="ts">
	import type { Entry } from '$lib/server/trenara/types';
	import { Loader2, Star } from 'lucide-svelte';
	import RpeSlider from '$lib/components/training/rpe-slider.svelte';
	import { rpeColors } from '$lib/components/training/rpe';
	import { describeError, describeResponse } from '$lib/utils/network';
	import { ratedEntry } from '$lib/utils/rated-entry';
	import { rememberRating } from '$lib/utils/rated-locally';

	/**
	 * `onRated` carries the entry the server answered with, so the week can
	 * hold the server's copy rather than the one this component patched.
	 */
	let {
		entry,
		onRated
	}: {
		entry: Entry;
		onRated?: (updated: Entry) => void;
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
				throw new Error(await describeResponse(res, 'Could not save your rating.'));
			}

			// The write to Trenara has happened, whatever the body below turns out
			// to hold — remembered so a read that has not caught up with it yet
			// (a reload landing on a stale instance, an upstream still propagating
			// the write) does not put the prompt back up. See `rated-locally.ts`.
			rememberRating(entry.id, rpeValue);

			// The response is the whole updated entry. Prefer it over the value
			// just sent — it is what was actually stored, and it carries
			// `ask_feedback` already retired.
			//
			// A body that is not that entry is not a failed rating: the write
			// already succeeded, so the rating stays on screen either way and
			// only the week's copy is left for the next refresh to correct.
			// That includes a body that is not JSON at all, which is why the
			// parse cannot be allowed to reach the catch below.
			const updated = ratedEntry(await res.json().catch(() => null), entry.id);
			entry.rpe = updated?.rpe ?? rpeValue;
			if (updated) onRated?.(updated);
		} catch (e) {
			error = describeError(e, 'Could not save your rating.');
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
