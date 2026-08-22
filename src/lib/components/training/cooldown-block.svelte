<script lang="ts">
	import { Loader2, Plus, X } from 'lucide-svelte';

	let {
		hasCooldown,
		text,
		color,
		pending,
		onchange
	}: {
		hasCooldown: boolean;
		/** The block's own text, or what stands in for it once it is gone. */
		text: string;
		color: string;
		pending: boolean;
		onchange: (next: boolean) => void;
	} = $props();
</script>

<!--
	The cool-down is the one block a runner can drop, so the whole row is the
	control rather than a small button parked at the end of it: a bigger target,
	and obviously interactive at a glance.

	Both states carry the same bordered action, so neither hides: bare grey text
	was too easy to miss on the present one. The accent is on that action alone
	when the cool-down is gone — enough to find, without a whole pink row
	shouting about a block the runner removed on purpose.
-->
<button
	type="button"
	disabled={pending}
	onclick={() => onchange(!hasCooldown)}
	class="-mx-1.5 flex w-full items-center gap-2.5 rounded-lg px-1.5 py-1 text-left text-sm transition-colors hover:bg-foreground/5 disabled:opacity-60"
>
	{#if hasCooldown}
		<span class="h-4 w-4 shrink-0 rounded-full" style="background-color: {color}"></span>
		<span class="flex-1 text-foreground">{text}</span>
	{:else}
		<span class="h-4 w-4 shrink-0 rounded-full border border-dashed border-muted-foreground/60"
		></span>
		<span class="flex-1 text-muted-foreground">{text}</span>
	{/if}

	<span
		class="inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors {hasCooldown
			? 'border-border text-muted-foreground'
			: 'border-primary/50 text-primary'}"
	>
		{#if pending}
			<Loader2 class="h-3 w-3 animate-spin" />
			Saving…
		{:else if hasCooldown}
			<X class="h-3 w-3" />
			Remove
		{:else}
			<Plus class="h-3 w-3" />
			Add back
		{/if}
	</span>
</button>
