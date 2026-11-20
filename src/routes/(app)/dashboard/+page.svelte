<script lang="ts">
	import { invalidate } from '$app/navigation';
	import type { PageServerData } from './$types';
	import type { Goal, UserStats } from '#lib/server/trenara/types.js';
	import Calendar from '#lib/components/calendar/calendar.svelte';
	import GoalCard from '#lib/components/goal/goal-card.svelte';
	import GoalCardShare from '#lib/components/goal/goal-card-share.svelte';
	import PredictionsCard from '#lib/components/predictions/predictions-card.svelte';
	import DashboardColumns from '#lib/components/dashboard/dashboard-columns.svelte';
	import { isRenderableStats } from '#lib/utils/user-stats.js';

	let { data }: { data: PageServerData } = $props();

	// What a background refresh brought back, if one has. The cards read through
	// it to the load's own data, so they show something from the first paint and
	// move on quietly afterwards.
	let refreshed = $state<{ goal: Goal | null; userStats: UserStats | null } | null>(null);

	const goal = $derived(refreshed?.goal ?? data.goal);
	const userStats = $derived(refreshed?.userStats ?? data.userStats);

	// Not part of `refreshed`: the manual refresh button only ever re-fetched
	// goal and stats, never the chart, and this keeps that unchanged rather
	// than reaching for a third endpoint response to widen it.
	const history = $derived(data.history);

	// Whether the goal card is open, while the cards are stacked above the
	// calendar. Closed to begin with: its head carries the prediction, so
	// opening it is for the graphs rather than for the numbers. Ignored from
	// `lg` up, where the cards are a column beside the calendar and there is
	// nothing to fold.
	let goalOpen = $state(false);

	/**
	 * Everything on this page except the calendar, which refreshes itself.
	 *
	 * Deliberately not `refreshAll`: that would re-run the page load and
	 * fetch the whole month again, which is the work the calendar's trimmed
	 * refresh exists to avoid.
	 */
	async function refreshPageData() {
		const [cards] = await Promise.allSettled([
			fetch('/api/v1/dashboard').then((res) => {
				if (!res.ok) throw new Error(`${res.status}`);
				return res.json() as Promise<{ goal: Goal | null; userStats: UserStats | null }>;
			}),
			// The navbar's news and chat badges hang off the layout load, which
			// knows nothing about the schedule — so this is cheap to re-run.
			invalidate('app:news')
		]);

		if (cards.status === 'fulfilled') {
			refreshed = cards.value;
		}
	}
</script>

<DashboardColumns>
	{#snippet cards()}
		{#if goal && isRenderableStats(userStats)}
			<!--
					The goal card folds down to its own head wherever it is stacked
					above the calendar, and the predictions table folds with it: the
					two are one disclosure, opened by the head that stays put above
					them.
				-->
			<GoalCard
				{goal}
				{userStats}
				history={history.records}
				historyError={history.error}
				collapsible
				expanded={goalOpen}
				ontoggle={() => (goalOpen = !goalOpen)}
				bodyId="goal-card-body"
			>
				{#snippet headerExtra()}
					<GoalCardShare share={data.share} goalName={goal.name} />
				{/snippet}
			</GoalCard>

			<!--
					The gap between the cards is inside the fold, not above it, so a
					closed card is not left holding 24px of nothing open beneath it.
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
					deleted, one not set yet — reached the same line as an outage did,
					and the runner was told something had gone wrong with the app when
					nothing had. The predictions stay: they are a fitness estimate and
					do not depend on a goal existing.
				-->
			<div class="rounded-lg border border-border bg-card p-4 shadow-sm">
				<p class="text-sm font-medium text-card-foreground">No goal set</p>
				<p class="mt-1 text-sm text-muted-foreground">
					Set a goal in the Trenara app to see it here.
				</p>
			</div>

			<div class="pt-6">
				<PredictionsCard {userStats} />
			</div>
		{:else}
			<p class="text-sm text-muted-foreground">Some data could not be loaded</p>
		{/if}
	{/snippet}

	{#snippet calendar()}
		<Calendar
			today={new Date()}
			schedule={data.schedule}
			openingView={data.openingView}
			{refreshPageData}
		/>
	{/snippet}
</DashboardColumns>
