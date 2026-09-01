<script lang="ts">
	import { PauseCircle } from 'lucide-svelte';
	import PausePlanModal from '$lib/components/modals/pause-plan-modal.svelte';
	import DeleteGoalModal from '$lib/components/modals/delete-goal-modal.svelte';
	import { appConfig } from '$lib/stores/app-config.svelte';
	import { pauseReasonLabel } from '$lib/utils/pause';

	/**
	 * The two things a runner can do to the plan itself rather than to a session
	 * in it: pause it, or delete the goal behind it.
	 *
	 * Kept off the goal card on purpose. That card is a reading — target, pace,
	 * how the trend is going — and a destructive control does not belong inside
	 * something people scan. This sits below it, after the predictions, where
	 * nothing is scrolled past on the way to somewhere else.
	 *
	 * The paused state comes from the account (`is_paused`, `paused_since`,
	 * `pause_cause` on `GET /api/me`), not from the goal, which is why it is
	 * passed in from the layout's copy rather than read from `goal`.
	 */
	let {
		paused,
		pausedSince = null,
		pauseCause = null,
		goalName = null,
		onchanged
	}: {
		paused: boolean;
		/** Unix seconds, as `/api/me` sends it. */
		pausedSince?: number | null;
		/** The wire value of the reason, e.g. `"holiday"`. */
		pauseCause?: string | null;
		goalName?: string | null;
		/** Called after a pause or a delete lands, so the caller can reload. */
		onchanged: () => void;
	} = $props();

	const causeLabel = $derived(pauseReasonLabel(pauseCause, appConfig.current));

	const sinceLabel = $derived(
		typeof pausedSince === 'number' && Number.isFinite(pausedSince) && pausedSince > 0
			? new Date(pausedSince * 1000).toLocaleDateString('en-US', {
					year: 'numeric',
					month: 'long',
					day: 'numeric'
				})
			: null
	);
</script>

<div class="rounded-lg border border-border bg-card p-6 shadow-sm">
	<h2 class="text-sm font-semibold tracking-wide text-muted-foreground uppercase">Plan</h2>

	{#if paused}
		<!--
			Paused is a state worth stating rather than implying by the absence of a
			button: the plan looks otherwise normal on every other screen, and a
			runner who paused a fortnight ago has no other way to be reminded of it.

			There is no resume control because there is no captured endpoint for
			one. Saying where it can be done beats a button that guesses at a path
			and fails — see `docs/backend-api.md`.
		-->
		<div
			class="mt-3 flex gap-3 rounded-md border border-border bg-secondary/40 p-3"
			data-testid="plan-paused"
		>
			<PauseCircle class="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
			<div class="text-sm">
				<p class="font-medium text-card-foreground">
					Your plan is paused{#if causeLabel}&nbsp;— {causeLabel}{/if}
				</p>
				<p class="mt-1 text-muted-foreground">
					{#if sinceLabel}Paused since {sinceLabel}.
					{/if}Pick it back up in the Trenara app.
				</p>
			</div>
		</div>
	{:else}
		<p class="mt-1 text-sm text-muted-foreground">
			Stop training for a while, or clear the goal and start again.
		</p>
	{/if}

	<div class="mt-4 flex flex-wrap items-center gap-3">
		{#if !paused}
			<PausePlanModal onPaused={onchanged} />
		{/if}
		<DeleteGoalModal {goalName} onDeleted={onchanged} />
	</div>
</div>
