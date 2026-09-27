<script module lang="ts">
	import { loadOnce } from '$lib/utils/load-once';

	/**
	 * Treadmill mode, fetched rather than shipped with the dashboard — the same
	 * arrangement as `change-date-modal.svelte`. A full-screen step-through a
	 * runner opens on the treadmill, not on the way past the calendar: the
	 * button stays here, the mode behind it is warmed once the page is idle and
	 * mounted on the first tap.
	 */
	const loadDialog = loadOnce(() => import('./treadmill-dialog.svelte'));
</script>

<script lang="ts">
	import { tick } from 'svelte';
	import type { ScheduledTraining } from '$lib/server/trenara/types';
	import TreadmillIcon from '$lib/components/icons/treadmill-icon.svelte';
	import { reloadOnStaleChunk, whenIdle } from '$lib/utils/load-once';

	let { training }: { training: ScheduledTraining } = $props();

	let Dialog = $state<typeof import('./treadmill-dialog.svelte').default | null>(null);
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

<!-- Mobile-only trigger, shown next to the training title -->
<button
	type="button"
	onclick={open}
	class="md:hidden shrink-0 rounded-md p-2.5 text-muted-foreground hover:bg-muted hover:text-primary transition-colors"
	aria-label="Start treadmill mode"
>
	<TreadmillIcon class="h-5 w-5" />
</button>

{#if Dialog}
	<Dialog bind:this={dialog} {training} />
{/if}
