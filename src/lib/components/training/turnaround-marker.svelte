<script lang="ts">
	import { Undo2 } from 'lucide-svelte';
	import type { TurnaroundText } from '$lib/utils/turnaround';

	let { text }: { text: TurnaroundText } = $props();
</script>

<!--
	A line across the plan where the way out ends: for a runner who goes out
	and back, the halfway point is where to turn to be home as the session
	ends. Muted and dashed, so it reads as a note on the plan rather than a
	step in it — not everyone runs out and back.
-->
<div class="flex flex-col gap-0.5 py-1 text-xs" data-testid="turnaround-marker">
	<div class="flex items-center gap-2 text-primary">
		<span class="h-0 flex-1 border-t border-dashed border-primary/50"></span>
		<Undo2 class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
		<span class="shrink-0 font-medium">{text.headline}</span>
		<span class="h-0 flex-1 border-t border-dashed border-primary/50"></span>
	</div>
	{#if text.detail}
		<p class="text-center text-muted-foreground">{text.detail}</p>
	{/if}
	{#if text.alternative}
		<p class="text-center text-muted-foreground">{text.alternative}</p>
	{/if}
</div>
