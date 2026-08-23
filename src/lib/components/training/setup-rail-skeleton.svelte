<!--
	The rail's stand-in while the session detail is in flight.

	The week payload carries none of the capability flags, so the chips can only
	appear after a second fetch. Rendering nothing until then made the card jump
	a row and left a runner who tapped a day with no sign that anything more was
	coming. This holds the rail's height and shape instead, so the chips arrive
	where the placeholders already were.
-->
<div class="mt-3 flex items-center gap-1.5" role="status" data-testid="setup-rail-skeleton">
	<div class="flex min-w-0 flex-1 gap-1.5 overflow-hidden" aria-hidden="true">
		<!-- A chip is 30px tall and a terrain, a shoe and an effort chip are about
		     this wide, so the rail settling in is not a second jump. -->
		{#each [96, 60, 76] as width, i (i)}
			<span
				class="h-[30px] shrink-0 animate-pulse rounded-full bg-muted motion-reduce:animate-none"
				style="width: {width}px; animation-delay: {i * 120}ms"
			></span>
		{/each}
	</div>
	<!-- The sliders button, which is smaller than the chips beside it. -->
	<span
		class="h-[28px] w-[28px] shrink-0 animate-pulse rounded-full bg-muted motion-reduce:animate-none"
		aria-hidden="true"
	></span>
	<span class="sr-only">Loading session setup…</span>
</div>
