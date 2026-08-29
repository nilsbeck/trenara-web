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
			countdown,
			summary.predictedTime
				? `predicted ${summary.predictedTime}${summary.predictedPace ? `, ${summary.predictedPace}` : ''}`
				: 'no prediction yet'
		].join(', ')
	);
</script>

<!--
	The goal card with the card taken away: the name, the countdown, and the
	reading the card exists to report. Closed, this answers "am I going to make
	it" without a tap; open, it is the heading of the card below it.

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
	class="flex w-full items-center gap-3 rounded-lg border border-border bg-card p-4 text-left shadow-sm transition-colors hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring"
>
	{#if summary.isPast}
		<Trophy class="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
	{:else}
		<Target class="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
	{/if}

	<!--
		`min-w-0` so a long goal name truncates rather than shouldering the
		prediction off the end of a narrow phone.

		The second line wraps instead of truncating: on a 320px screen the pace
		drops to a line of its own, which costs 16px and keeps the number. The
		whole block is `aria-hidden` in favour of the button's own label — the
		separators and the split across two lines read badly aloud.
	-->
	<div class="flex min-w-0 flex-1 flex-col gap-1" aria-hidden="true">
		<span class="truncate text-sm font-semibold text-card-foreground">{summary.name}</span>

		<!--
			No separator between the two halves, unlike the card's own event line:
			that line never wraps, and this one is built to. A pipe that lands at
			the end of a wrapped line dangles there pointing at nothing, and the
			word "Predicted" already marks where the countdown stops.
		-->
		<span class="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
			<span>{countdown}</span>
			{#if summary.predictedTime}
				<!--
					"Predicted" is said once, in front of the time, because the goal
					time is the other number this card carries and an unlabelled
					3:42:15 beside a goal name reads as the goal itself.
				-->
				<span class="whitespace-nowrap">
					Predicted
					<span class="font-semibold tabular-nums text-card-foreground">
						{summary.predictedTime}
					</span>
				</span>
				{#if summary.predictedPace}
					<span class="whitespace-nowrap tabular-nums">{summary.predictedPace}</span>
				{/if}
			{:else}
				<span>No prediction yet</span>
			{/if}
		</span>
	</div>

	<ChevronDown
		class="h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200 {expanded
			? 'rotate-180'
			: ''}"
		aria-hidden="true"
	/>
</button>
