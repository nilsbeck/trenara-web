<script lang="ts">
	import { Loader2 } from 'lucide-svelte';
</script>

<!--
	The rail while the session detail is in flight.

	The week payload carries none of the capability flags, so the chips can only
	appear after a second fetch. This stands in the rail's place at the chips'
	own height, so they arrive where it already was rather than growing the card
	a row — and it says what it is doing: grey pills waiting to fill read as
	empty content, not as something on its way.
-->
<div class="flex items-center gap-1.5" role="status" data-testid="setup-rail-loading">
	<span
		class="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-dashed border-border bg-muted px-2.5 py-1.5 text-xs font-medium text-muted-foreground"
	>
		<Loader2 class="h-3 w-3 animate-spin" aria-hidden="true" />
		Loading setup…
	</span>
</div>
