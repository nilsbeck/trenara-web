<script module lang="ts">
	import { loadOnce } from '$lib/utils/load-once';

	/**
	 * The rating dialog, fetched rather than shipped with the dashboard — the
	 * same arrangement as `change-date-modal.svelte`. The star button stays
	 * here, badge and pulse included, because it is what the card shows; the
	 * dialog behind it is warmed once the page is idle and mounted on the first
	 * tap.
	 */
	const loadDialog = loadOnce(() => import('./give-feedback-dialog.svelte'));
</script>

<script lang="ts">
	import { tick } from 'svelte';
	import type { ScheduledTraining, Entry } from '$lib/server/trenara/types';
	import { Star } from 'lucide-svelte';
	import { reloadOnStaleChunk, whenIdle } from '$lib/utils/load-once';

	/** `training` is passed through unread — see `give-feedback-dialog.svelte`. */
	let {
		training,
		entry,
		onRated
	}: {
		training: ScheduledTraining;
		entry: Entry;
		onRated?: (updated: Entry) => void;
	} = $props();

	let Dialog = $state<typeof import('./give-feedback-dialog.svelte').default | null>(null);
	let dialog = $state<{ open: () => void }>();

	// Warming a chunk is syncing with the network, not deriving state.
	$effect(() => whenIdle(() => void loadDialog().catch(() => {})));

	async function open() {
		try {
			Dialog = (await loadDialog()).default;
		} catch (error) {
			reloadOnStaleChunk(error);
			return;
		}
		await tick();
		dialog?.open();
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

{#if Dialog}
	<Dialog bind:this={dialog} {training} {entry} {onRated} />
{/if}

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
