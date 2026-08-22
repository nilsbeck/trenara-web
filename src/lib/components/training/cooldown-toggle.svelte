<script lang="ts">
	import { Loader2 } from 'lucide-svelte';

	let {
		hasCooldown,
		pending,
		onchange
	}: {
		hasCooldown: boolean;
		pending: boolean;
		onchange: (next: boolean) => void;
	} = $props();
</script>

<!--
	The cool-down is the one block a runner can drop, so its control sits on the
	block rather than in the setup sheet: nothing is buried a tap deeper than the
	thing it changes. Flipping it moves the block, the shape bar and the totals
	together, and seeing the plan change is the confirmation — no dialog.
-->
<button
	type="button"
	disabled={pending}
	onclick={() => onchange(!hasCooldown)}
	class="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60"
>
	{#if pending}
		<Loader2 class="h-3 w-3 animate-spin" />
		Saving…
	{:else}
		{hasCooldown ? 'Remove' : 'Add back'}
	{/if}
</button>
