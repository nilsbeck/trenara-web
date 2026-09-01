<script lang="ts">
	import { Trash2, X, Loader2, TriangleAlert } from 'lucide-svelte';
	import { describeError, describeResponse } from '$lib/utils/network';

	/**
	 * Deleting the goal, and the plan built for it.
	 *
	 * A confirmation stands in front of it because nothing in this app can undo
	 * it: no route here sets a goal, so a runner who deletes one gets it back
	 * only by setting a new one in Trenara's own app. The dialog says that rather
	 * than asking "are you sure?", which is a question nobody reads.
	 *
	 * `onDeleted` fires after the write is acknowledged; the caller reloads, and
	 * the goal page falls into the empty state it already has for an account with
	 * no goal.
	 */
	let { goalName, onDeleted }: { goalName?: string | null; onDeleted?: () => void } = $props();

	let dialogEl: HTMLDialogElement | undefined = $state();
	let submitting = $state(false);
	let error = $state<string | null>(null);

	function open() {
		error = null;
		dialogEl?.showModal();
	}

	function close() {
		dialogEl?.close();
	}

	async function handleDelete() {
		submitting = true;
		error = null;

		try {
			const res = await fetch('/api/v1/goal', { method: 'DELETE' });

			if (!res.ok) {
				throw new Error(await describeResponse(res, 'Could not delete your goal.'));
			}

			close();
			onDeleted?.();
		} catch (e) {
			error = describeError(e, 'Could not delete your goal.');
		} finally {
			submitting = false;
		}
	}
</script>

<button
	type="button"
	onclick={open}
	class="inline-flex items-center justify-center gap-2 rounded-md border border-destructive/40 px-3 py-1.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
>
	<Trash2 class="h-4 w-4" aria-hidden="true" />
	Delete goal
</button>

<dialog
	bind:this={dialogEl}
	aria-labelledby="delete-goal-title"
	class="fixed top-1/2 left-1/2 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-card p-0 shadow-xl backdrop:bg-black/50"
	onclick={(e) => {
		if (e.target === dialogEl) close();
	}}
>
	<div class="p-6">
		<div class="mb-4 flex items-center justify-between">
			<h2 id="delete-goal-title" class="text-lg font-semibold text-card-foreground">Delete goal</h2>
			<button
				type="button"
				onclick={close}
				class="rounded-md p-1 text-muted-foreground hover:text-card-foreground"
				aria-label="Close"
			>
				<X class="h-5 w-5" />
			</button>
		</div>

		<div class="mb-6 flex gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-3">
			<TriangleAlert class="h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
			<div class="text-sm text-card-foreground">
				<p>
					{#if goalName}
						<strong>{goalName}</strong> and the plan built for it are removed.
					{:else}
						Your goal and the plan built for it are removed.
					{/if}
				</p>
				<p class="mt-2 text-muted-foreground">
					This cannot be undone from here — a new goal is set in the Trenara app. Your goal history
					and your recorded runs stay.
				</p>
			</div>
		</div>

		{#if error}
			<p class="mb-4 text-sm text-destructive" role="alert">{error}</p>
		{/if}

		<div class="flex items-center justify-end gap-3">
			<button
				type="button"
				onclick={close}
				class="rounded-md px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-card-foreground"
			>
				Keep goal
			</button>
			<button
				type="button"
				disabled={submitting}
				onclick={handleDelete}
				class="inline-flex items-center gap-2 rounded-md bg-destructive px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
			>
				{#if submitting}
					<Loader2 class="h-4 w-4 animate-spin" aria-hidden="true" />
					Deleting…
				{:else}
					Delete goal
				{/if}
			</button>
		</div>
	</div>
</dialog>
