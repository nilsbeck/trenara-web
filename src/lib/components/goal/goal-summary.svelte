<script lang="ts">
	import { Target, Trophy, ChevronDown } from 'lucide-svelte';
	import type { GoalSummary } from '$lib/utils/goal-summary';

	let {
		summary,
		expanded,
		controls,
		ontoggle
	}: {
		summary: GoalSummary;
		expanded: boolean;
		/** The id of the region this strip opens, for `aria-controls`. */
		controls: string;
		ontoggle: () => void;
	} = $props();

	const countdown = $derived(
		summary.isPast
			? 'Completed'
			: summary.weeks === 0
				? 'Race week'
				: `${summary.weeks} ${summary.weeks === 1 ? 'week' : 'weeks'} to go`
	);

	/**
	 * The whole strip as a sentence, so the button announces what it is showing
	 * rather than "Berlin Marathon, collapsed" and leaving the numbers to be
	 * found by opening it. The visible text is hidden from the tree in favour
	 * of this, so the two must stay in step.
	 */
	const label = $derived(
		[
			summary.name,
			summary.distance,
			countdown,
			summary.predictedTime
				? `predicted time ${summary.predictedTime}, predicted pace ${summary.predictedPace ?? 'unknown'}`
				: 'no prediction yet'
		]
			.filter(Boolean)
			.join(', ')
	);
</script>

<!--
	The goal card with the card taken away: what the goal is, how long is left,
	and the reading the card exists to report. Closed, this answers "am I going
	to make it" without a tap; open, it is the heading of the card below it.

	A button rather than a `<summary>`, because the same markup has to be a
	disclosure on a phone and a plain heading from `sm` up — and a closed
	`<details>` hides its children in the UA stylesheet, where no media query
	can reach in and force one open.
-->
<button
	type="button"
	onclick={ontoggle}
	aria-expanded={expanded}
	aria-controls={controls}
	aria-label={label}
	class="w-full rounded-lg border border-border bg-card p-4 text-left shadow-sm transition-colors hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring"
>
	<div class="flex items-start gap-3" aria-hidden="true">
		{#if summary.isPast}
			<Trophy class="mt-0.5 h-5 w-5 shrink-0 text-primary" />
		{:else}
			<Target class="mt-0.5 h-5 w-5 shrink-0 text-primary" />
		{/if}

		<!--
			`min-w-0` so a long goal name truncates rather than shouldering the
			chevron off the end of a narrow phone. The line under it is short
			enough not to wrap even at 320px, which is what lets it keep the
			card's own pipe separator: a pipe that wrapped to the end of a line
			would dangle there pointing at nothing.
		-->
		<div class="min-w-0 flex-1">
			<p class="truncate text-sm font-semibold text-card-foreground">{summary.name}</p>
			<p class="mt-0.5 flex items-baseline gap-2 text-xs text-muted-foreground">
				{#if summary.distance}
					<span class="whitespace-nowrap">{summary.distance}</span>
					<span class="text-border">|</span>
				{/if}
				<span class="whitespace-nowrap">{countdown}</span>
			</p>
		</div>

		<ChevronDown
			class="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200 {expanded
				? 'rotate-180'
				: ''}"
		/>
	</div>

	<!--
		The two numbers side by side under a rule, each labelled.

		They are labelled because the goal has a time and a pace of its own — the
		card below spells both out in a table — and an unlabelled 3:24:30 under a
		goal's name reads as the goal rather than as the prediction. Full width
		rather than indented under the name: these are what the strip is for, and
		a stat that lines up under a heading reads as a detail of it.
	-->
	<div class="mt-3 border-t border-border pt-3" aria-hidden="true">
		{#if summary.predictedTime}
			<div class="flex items-stretch text-center">
				<div class="min-w-0 flex-1">
					<p class="truncate text-lg font-bold tabular-nums text-card-foreground">
						{summary.predictedTime}
					</p>
					<p class="mt-0.5 text-[11px] leading-tight text-muted-foreground">Predicted time</p>
				</div>
				{#if summary.predictedPace}
					<div class="w-px shrink-0 bg-border"></div>
					<div class="min-w-0 flex-1">
						<p class="truncate text-lg font-bold tabular-nums text-card-foreground">
							{summary.predictedPace}
						</p>
						<p class="mt-0.5 text-[11px] leading-tight text-muted-foreground">Predicted pace</p>
					</div>
				{/if}
			</div>
		{:else}
			<p class="text-center text-xs text-muted-foreground">No prediction yet</p>
		{/if}
	</div>
</button>
