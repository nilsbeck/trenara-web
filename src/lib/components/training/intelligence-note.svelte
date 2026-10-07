<script lang="ts">
	import { Sparkles } from 'lucide-svelte';

	let { paragraphs }: { paragraphs: string[] } = $props();
</script>

<!--
	Trenara Intelligence's note on a session it adjusted to the runner's recent
	load. Drawn as the mobile app draws it: a tinted card with its own heading,
	set apart from the coach's message, because it is a different voice saying a
	different thing — why today's numbers are not the plan's.

	The note often closes by offering to shorten the session back. The endpoint
	behind that offer has not been captured, so there is no button here; the
	distance package in the setup panel stays the way to change it.
-->
<section
	class="overflow-hidden rounded-xl border-b-2 border-violet-500 bg-linear-to-br from-primary/30 to-violet-600/30 px-4 py-3"
	aria-labelledby="intelligence-heading"
	data-testid="intelligence-note"
>
	<h4
		id="intelligence-heading"
		class="mb-1.5 flex items-center gap-2 text-sm font-semibold text-primary"
	>
		<Sparkles class="h-4 w-4" aria-hidden="true" />
		Trenara Intelligence
	</h4>
	<div class="flex flex-col gap-2 text-sm leading-relaxed text-foreground">
		<!-- Position is the identity: two paragraphs may read the same. -->
		{#each paragraphs as paragraph, i (i)}
			<p>{paragraph}</p>
		{/each}
	</div>
</section>
