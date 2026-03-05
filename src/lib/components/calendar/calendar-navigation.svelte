<script lang="ts">
	import { getContext } from 'svelte';
	import type { CalendarStore } from '$lib/stores/calendar.svelte';
	import { RefreshCw, ChevronLeft, ChevronRight } from 'lucide-svelte';

	const store = getContext<CalendarStore>('calendar');
</script>

<div class="flex items-center gap-1">
	<button
		type="button"
		onclick={() => store.navigation.refresh()}
		disabled={store.isLoading}
		class="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
		aria-label="Refresh"
	>
		<RefreshCw class="h-4 w-4" />
	</button>
	<button
		type="button"
		onclick={() => store.navigation.goToPreviousMonth()}
		disabled={store.isLoading}
		class="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
		aria-label="Previous month"
	>
		<ChevronLeft class="h-4 w-4" />
	</button>
	<button
		type="button"
		onclick={() => store.navigation.goToNextMonth()}
		disabled={store.isLoading}
		class="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
		aria-label="Next month"
	>
		<ChevronRight class="h-4 w-4" />
	</button>
</div>
