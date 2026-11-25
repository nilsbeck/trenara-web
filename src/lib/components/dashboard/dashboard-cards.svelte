<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { Goal, UserStats } from '#lib/server/trenara/types.js';
	import type { ChartDataPoint } from '#lib/components/charts/prediction-chart.svelte';
	import GoalCard from '#lib/components/goal/goal-card.svelte';
	import PredictionsCard from '#lib/components/predictions/predictions-card.svelte';
	import { isRenderableStats } from '#lib/utils/user-stats.js';

	/**
	 * The dashboard's card column: the goal card, the predictions folded with
	 * it, and what stands in when there is no goal or no stats.
	 *
	 * Its own component because two pages draw it — the dashboard, from its
	 * load, and the offline page (`src/routes/offline`), from the copy kept on
	 * the device — and the fold between the two cards is the kind of detail a
	 * second copy would drift from. Everything it draws is handed in; nothing
	 * here fetches.
	 */
	interface Props {
		goal: Goal | null;
		userStats: UserStats | null;
		history: ChartDataPoint[];
		historyError?: string | null;
		/** Beside the goal card's trend badge — the share button on the dashboard. */
		headerExtra?: Snippet;
	}

	let { goal, userStats, history, historyError = null, headerExtra }: Props = $props();

	// Whether the goal card is open, while the cards are stacked above the
	// calendar. Closed to begin with: its head carries the prediction, so
	// opening it is for the graphs rather than for the numbers. Ignored from
	// `lg` up, where the cards are a column beside the calendar and there is
	// nothing to fold.
	let goalOpen = $state(false);
</script>

{#if goal && isRenderableStats(userStats)}
	<!--
		The goal card folds down to its own head wherever it is stacked above the
		calendar, and the predictions table folds with it: the two are one
		disclosure, opened by the head that stays put above them.
	-->
	<GoalCard
		{goal}
		{userStats}
		{history}
		{historyError}
		collapsible
		expanded={goalOpen}
		ontoggle={() => (goalOpen = !goalOpen)}
		bodyId="goal-card-body"
		{headerExtra}
	/>

	<!--
		The gap between the cards is inside the fold, not above it, so a closed
		card is not left holding 24px of nothing open beneath it.
	-->
	<div
		class="grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none lg:visible lg:grid-rows-[1fr] lg:opacity-100 {goalOpen
			? 'visible grid-rows-[1fr] opacity-100'
			: 'invisible grid-rows-[0fr] opacity-0'}"
	>
		<div class="overflow-hidden lg:overflow-visible">
			<div class="pt-6">
				<PredictionsCard {userStats} />
			</div>
		</div>
	</div>
{:else if isRenderableStats(userStats)}
	<!--
		No goal is not "some data could not be loaded".

		The goal read fails soft here, so an account with no goal — one just
		deleted, one not set yet — reached the same line as an outage did, and
		the runner was told something had gone wrong with the app when nothing
		had. The predictions stay: they are a fitness estimate and do not depend
		on a goal existing.
	-->
	<div class="rounded-lg border border-border bg-card p-4 shadow-sm">
		<p class="text-sm font-medium text-card-foreground">No goal set</p>
		<p class="mt-1 text-sm text-muted-foreground">Set a goal in the Trenara app to see it here.</p>
	</div>

	<div class="pt-6">
		<PredictionsCard {userStats} />
	</div>
{:else}
	<p class="text-sm text-muted-foreground">Some data could not be loaded</p>
{/if}
