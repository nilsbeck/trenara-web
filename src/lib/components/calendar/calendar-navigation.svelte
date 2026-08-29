<script lang="ts">
	import { getContext } from 'svelte';
	import type { CalendarStore } from '$lib/stores/calendar.svelte';
	import { RefreshCw, ChevronLeft, ChevronRight } from 'lucide-svelte';

	const store = getContext<CalendarStore>('calendar');

	// The arrows step by whatever the grid is showing: a month when it is open,
	// a week once it has been folded.
	const isWeekView = $derived(store.viewMode === 'week');
	const previousLabel = $derived(isWeekView ? 'Previous week' : 'Previous month');
	const nextLabel = $derived(isWeekView ? 'Next week' : 'Next month');

	// The only thing on screen that says a refresh is happening, so it has to
	// carry the whole message: spinning while data is being checked, and telling
	// you when it last came back if you stop to look.
	const refreshLabel = $derived.by(() => {
		if (store.isRevalidating) return 'Checking for changes…';
		if (store.lastUpdatedAt === null) return 'Refresh';
		const at = new Date(store.lastUpdatedAt).toLocaleTimeString(undefined, {
			hour: '2-digit',
			minute: '2-digit'
		});
		return `Refresh — last updated ${at}`;
	});
</script>

<div class="flex items-center gap-1">
	<button
		type="button"
		onclick={() => store.navigation.refresh()}
		disabled={store.isLoading}
		class="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
		class:text-foreground={store.isRevalidating}
		aria-label="Refresh"
		aria-busy={store.isRevalidating}
		title={refreshLabel}
	>
		<RefreshCw class={store.isRevalidating ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
	</button>
	<button
		type="button"
		onclick={() => store.navigation.goToPrevious()}
		disabled={store.isLoading}
		class="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
		aria-label={previousLabel}
		title={previousLabel}
	>
		<ChevronLeft class="h-4 w-4" />
	</button>
	<button
		type="button"
		onclick={() => store.navigation.goToNext()}
		disabled={store.isLoading}
		class="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
		aria-label={nextLabel}
		title={nextLabel}
	>
		<ChevronRight class="h-4 w-4" />
	</button>
</div>
