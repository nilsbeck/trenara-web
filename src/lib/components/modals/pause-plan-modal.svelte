<script lang="ts">
	import { PauseCircle, X, Loader2 } from 'lucide-svelte';
	import { appConfig } from '$lib/stores/app-config.svelte';
	import { pauseReasons } from '$lib/utils/pause';
	import { describeError, describeResponse } from '$lib/utils/network';

	/**
	 * Pausing the plan, and saying why.
	 *
	 * The reasons are the served ones (`pause_types` from `/api/config/app`),
	 * falling back to the captured five when the config request failed — see
	 * `$lib/utils/pause`. Nothing here keys off a label: the radio's value is the
	 * wire `type`, and the titles are localised upstream.
	 *
	 * `onPaused` fires only after the write is acknowledged. The caller reloads
	 * from it rather than being handed a payload: what changes is `is_paused`,
	 * `paused_since` and `pause_cause` on the account, and those are read by the
	 * layout, not by this dialog.
	 */
	let { onPaused }: { onPaused?: () => void } = $props();

	let dialogEl: HTMLDialogElement | undefined = $state();
	let selected = $state<string | null>(null);
	let extraInput = $state('');
	let submitting = $state(false);
	let error = $state<string | null>(null);

	const reasons = $derived(pauseReasons(appConfig.current));
	const chosen = $derived(reasons.find((reason) => reason.type === selected) ?? null);

	/**
	 * Whether the reason wants words, and does not have them.
	 *
	 * `ask_extra_input` is upstream's flag for the reasons that come with a
	 * follow-up question, and it is honoured here rather than only relayed: a
	 * pause filed as "Other" with nothing after it tells a coach less than not
	 * filing it at all. Whether the backend itself refuses an empty one is not
	 * known — this is the app's own rule, and it is why the field is marked
	 * required rather than merely offered.
	 */
	const needsWords = $derived(chosen?.askExtraInput === true && extraInput.trim() === '');

	function open() {
		selected = null;
		extraInput = '';
		error = null;
		dialogEl?.showModal();
	}

	function close() {
		dialogEl?.close();
	}

	async function handleSubmit() {
		if (!chosen || needsWords) return;

		submitting = true;
		error = null;

		try {
			const res = await fetch('/api/v1/goal/pause', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ type: chosen.type, extraInput: extraInput.trim() })
			});

			if (!res.ok) {
				throw new Error(await describeResponse(res, 'Could not pause your plan.'));
			}

			close();
			onPaused?.();
		} catch (e) {
			error = describeError(e, 'Could not pause your plan.');
		} finally {
			submitting = false;
		}
	}
</script>

<button
	type="button"
	onclick={open}
	class="inline-flex items-center justify-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
>
	<PauseCircle class="h-4 w-4" aria-hidden="true" />
	Pause plan
</button>

<dialog
	bind:this={dialogEl}
	aria-labelledby="pause-plan-title"
	class="fixed top-1/2 left-1/2 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-card p-0 shadow-xl backdrop:bg-black/50"
	onclick={(e) => {
		if (e.target === dialogEl) close();
	}}
>
	<div class="p-6">
		<div class="mb-4 flex items-center justify-between">
			<h2 id="pause-plan-title" class="text-lg font-semibold text-card-foreground">Pause plan</h2>
			<button
				type="button"
				onclick={close}
				class="rounded-md p-1 text-muted-foreground hover:text-card-foreground"
				aria-label="Close"
			>
				<X class="h-5 w-5" />
			</button>
		</div>

		<p class="mb-4 text-sm text-muted-foreground">
			Training stops until you pick it back up. Your coach sees the reason.
		</p>

		<fieldset class="mb-4">
			<legend class="mb-2 text-sm font-medium text-card-foreground">Why are you pausing?</legend>
			<div class="space-y-1">
				{#each reasons as reason (reason.type)}
					<label
						class="flex cursor-pointer items-center gap-3 rounded-md border border-border px-3 py-2 text-sm text-card-foreground transition-colors hover:bg-secondary"
						class:border-primary={selected === reason.type}
					>
						<input
							type="radio"
							name="pause-reason"
							value={reason.type}
							bind:group={selected}
							class="h-4 w-4 accent-primary"
						/>
						{reason.label}
					</label>
				{/each}
			</div>
		</fieldset>

		<!--
			Only for the reasons that ask for it. Rendering it always would invite a
			note on a reason the backend does not carry one for, and hiding it behind
			the flag is what the flag is for.
		-->
		{#if chosen?.askExtraInput}
			<div class="mb-4">
				<label for="pause-extra-input" class="mb-1 block text-sm font-medium text-card-foreground">
					Tell your coach more
				</label>
				<textarea
					id="pause-extra-input"
					bind:value={extraInput}
					rows="3"
					maxlength="1000"
					required
					placeholder="A sentence is enough."
					class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
				></textarea>
			</div>
		{/if}

		{#if error}
			<p class="mb-4 text-sm text-destructive" role="alert">{error}</p>
		{/if}

		<div class="flex items-center justify-end gap-3">
			<button
				type="button"
				onclick={close}
				class="rounded-md px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-card-foreground"
			>
				Cancel
			</button>
			<button
				type="button"
				disabled={submitting || !chosen || needsWords}
				onclick={handleSubmit}
				class="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
			>
				{#if submitting}
					<Loader2 class="h-4 w-4 animate-spin" aria-hidden="true" />
					Pausing…
				{:else}
					Pause plan
				{/if}
			</button>
		</div>
	</div>
</dialog>
