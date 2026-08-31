<script lang="ts">
	import type { ScheduledTraining, Entry } from '$lib/server/trenara/types';
	import { Star, X, Loader2 } from 'lucide-svelte';
	import RpeSlider from '$lib/components/training/rpe-slider.svelte';
	import { rpeColors } from '$lib/components/training/rpe';
	import { describeError, describeResponse } from '$lib/utils/network';
	import { ratedEntry } from '$lib/utils/rated-entry';

	/**
	 * `training` is accepted and not read: callers pass the pair, and the RPE
	 * dialog only ever needs the entry that was actually run. Kept in the
	 * signature so the call sites stay honest about what this is rating.
	 *
	 * `onRated` carries the entry the server answered with, so the week can
	 * hold the server's copy rather than the one this component patched.
	 */
	let {
		training: _training,
		entry,
		onRated
	}: {
		training: ScheduledTraining;
		entry: Entry;
		onRated?: (updated: Entry) => void;
	} = $props();

	let dialogEl: HTMLDialogElement | undefined = $state();
	let rpeValue = $state(5);
	let submitting = $state(false);
	let error = $state<string | null>(null);

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
				throw new Error(await describeResponse(res, 'Could not save your rating.'));
			}

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

			close();
		} catch (e) {
			error = describeError(e, 'Could not save your rating.');
		} finally {
			submitting = false;
		}
	}
</script>

<button
	type="button"
	onclick={open}
	class="relative rounded-md p-2.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
	class:star-pulse={entry.rpe == null}
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
	onclick={(e) => {
		if (e.target === dialogEl) close();
	}}
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
			<RpeSlider bind:value={rpeValue} />
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
	/* Subtle pulse for unrated star button */
	.star-pulse {
		animation: star-pulse 2s ease-in-out infinite;
		color: #f59e0b !important;
	}

	@keyframes star-pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.5;
		}
	}
</style>
