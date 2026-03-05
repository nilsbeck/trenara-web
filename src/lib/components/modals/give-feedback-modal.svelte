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
	class="relative rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
	aria-label="Give feedback"
>
	<Star class="h-4 w-4" />
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
	class="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm rounded-lg border border-border bg-card p-0 shadow-xl backdrop:bg-black/50"
	onclick={(e) => { if (e.target === dialogEl) close(); }}
>
	<div class="p-6">
		<div class="flex items-center justify-between mb-4">
			<h2 class="text-lg font-semibold text-card-foreground">Give Feedback</h2>
			<button
				type="button"
				onclick={close}
				class="rounded-md p-1 text-muted-foreground hover:text-card-foreground"
			>
				<X class="h-5 w-5" />
			</button>
		</div>

		<p class="text-sm text-muted-foreground mb-6">
			Rate your perceived exertion (RPE) for this training.
		</p>

		<div class="mb-6">
			<input
				type="range"
				min="1"
				max="10"
				step="1"
				bind:value={rpeValue}
				class="w-full accent-primary"
			/>
			<div class="flex justify-between mt-1.5 text-xs text-muted-foreground">
				{#each Array.from({ length: 10 }, (_, i) => i + 1) as n}
					<span
						class="w-5 text-center"
						class:text-primary={n === rpeValue}
						class:font-semibold={n === rpeValue}
					>{n}</span>
				{/each}
			</div>
			<div class="flex justify-between mt-1 text-[10px] text-muted-foreground">
				<span>Easy</span>
				<span>Max effort</span>
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
				class="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
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
