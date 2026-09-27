<script module lang="ts">
	import { loadOnce } from '$lib/utils/load-once';

	/**
	 * The dialog itself, fetched rather than shipped with the dashboard.
	 *
	 * It is a whole month picker behind one small button on the session card,
	 * and most visits never press it. The button stays here, drawn with the
	 * card; the picker is warmed once the page is idle and mounted on the first
	 * tap, after which it stays mounted exactly as it used to.
	 */
	const loadDialog = loadOnce(() => import('./change-date-dialog.svelte'));
</script>

<script lang="ts">
	import { tick } from 'svelte';
	import type { ScheduledTraining } from '$lib/server/trenara/types';
	import { CalendarDays } from 'lucide-svelte';
	import { reloadOnStaleChunk, whenIdle } from '$lib/utils/load-once';

	let {
		training,
		selectedDate,
		onMoved
	}: {
		training: ScheduledTraining;
		selectedDate: string | null;
		/** The week `change_save` handed back — see `change-date-dialog.svelte`. */
		onMoved?: (trainings: ScheduledTraining[]) => void;
	} = $props();

	let Dialog = $state<typeof import('./change-date-dialog.svelte').default | null>(null);
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
	class="rounded-md p-2.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
	aria-label="Change date"
>
	<CalendarDays class="h-5 w-5" />
</button>

{#if Dialog}
	<Dialog bind:this={dialog} {training} {selectedDate} {onMoved} />
{/if}
