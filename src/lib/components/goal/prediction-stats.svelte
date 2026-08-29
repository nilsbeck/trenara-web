<script lang="ts">
	let {
		time,
		pace
	}: {
		/** The predicted finish time, or null before the API has predicted one. */
		time: string | null;
		/** The matching pace, already shortened by `shortenPaceUnit`. */
		pace: string | null;
	} = $props();
</script>

<!--
	The two numbers side by side under a rule, each labelled. This is what the
	goal card says about itself while it is closed — the card's table spells the
	same prediction out against the goal, and this is that table's one row.

	They are labelled because the goal has a time and a pace of its own, and an
	unlabelled 3:24:30 under a goal's name reads as the goal rather than as the
	projection of it.
-->
<div class="border-t border-border pt-3">
	{#if time}
		<div class="flex items-stretch text-center">
			<div class="min-w-0 flex-1">
				<p class="truncate text-lg font-bold tabular-nums text-card-foreground">{time}</p>
				<p class="mt-0.5 text-[11px] leading-tight text-muted-foreground">Predicted time</p>
			</div>
			{#if pace}
				<div class="w-px shrink-0 bg-border"></div>
				<div class="min-w-0 flex-1">
					<p class="truncate text-lg font-bold tabular-nums text-card-foreground">{pace}</p>
					<p class="mt-0.5 text-[11px] leading-tight text-muted-foreground">Predicted pace</p>
				</div>
			{/if}
		</div>
	{:else}
		<p class="text-center text-xs text-muted-foreground">No prediction yet</p>
	{/if}
</div>
