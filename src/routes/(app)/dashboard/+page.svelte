<script lang="ts">
	import { invalidate } from '$app/navigation';
	import type { PageServerData } from './$types';
	import type { Goal, UserStats } from '$lib/server/trenara/types';
	import Calendar from '$lib/components/calendar/calendar.svelte';
	import GoalCard from '$lib/components/goal/goal-card.svelte';
	import GoalSummary from '$lib/components/goal/goal-summary.svelte';
	import PredictionsCard from '$lib/components/predictions/predictions-card.svelte';
	import { isRenderableStats } from '$lib/utils/user-stats';
	import { readGoalSummary } from '$lib/utils/goal-summary';

	let { data }: { data: PageServerData } = $props();

	// What a background refresh brought back, if one has. The cards read through
	// it to the load's own data, so they show something from the first paint and
	// move on quietly afterwards.
	let refreshed = $state<{ goal: Goal | null; userStats: UserStats | null } | null>(null);

	const goal = $derived(refreshed?.goal ?? data.goal);
	const userStats = $derived(refreshed?.userStats ?? data.userStats);

	// The closed state of the goal card, on a phone. Everything in it comes off
	// the two objects above, both of which the page `load` has already awaited,
	// so the strip is on screen from the first paint rather than after a fetch.
	const summary = $derived(readGoalSummary(goal, userStats, new Date()));

	// Closed to begin with: the strip carries the answer, so opening it is for
	// the graphs rather than for the numbers. Ignored from `sm` up, where the
	// cards are a column beside the calendar and there is nothing to open.
	let goalOpen = $state(false);

	/**
	 * Everything on this page except the calendar, which refreshes itself.
	 *
	 * Deliberately not `invalidateAll`: that would re-run the page load and
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

<!--
	Side by side at `lg`, not `md`. Both columns are 28rem, so the pair needs
	920px before the gap — more than the 768px `md` was letting them try, which
	pushed the second column off the side of the viewport.
-->
<div class="flex flex-col items-center justify-center lg:flex-row">
	<div class="flex flex-col items-start justify-center lg:flex-row lg:space-x-6">
		<!--
			The goal column leads the source and steps behind the calendar from
			`sm` up.

			On a phone that ordering is the whole point of the strip: a month grid
			and its day detail fill the screen, so anything below the calendar is
			as far out of reach as it was in the menu. Source order rather than
			`order` alone, so the strip is also the first thing a keyboard or a
			screen reader meets — the same argument. The cost is that from `sm` up
			both land on the cards before the calendar; there the two are
			side-by-side peers, and the mismatch is worth the phone.

			The width is definite, matching the calendar. Without one this column
			is sized by its content, which means by the widest thing the cards
			happen to contain — and lines up with the calendar only by chance.
		-->
		<div class="w-[28rem] min-w-0 max-w-full sm:order-2">
			{#if goal && isRenderableStats(userStats)}
				{#if summary}
					<div class="mb-6 sm:hidden">
						<GoalSummary
							{summary}
							expanded={goalOpen}
							controls="goal-details"
							ontoggle={() => (goalOpen = !goalOpen)}
						/>
					</div>
				{/if}

				<!--
					One instance of the cards at every width, opened by the strip below
					`sm` and always open above it. Two instances would be the simpler
					markup and would mount `GoalCard` twice — firing its prediction
					tracking and its goal archiving twice on every dashboard load.
				-->
				<div id="goal-details" class="{goalOpen ? 'block' : 'hidden'} space-y-6 sm:block">
					<GoalCard {goal} {userStats} />
					<PredictionsCard {userStats} />
				</div>
			{:else}
				<p class="text-sm text-muted-foreground">Some data could not be loaded</p>
			{/if}
		</div>

		<div class="flex flex-col items-center sm:order-1 lg:flex-row">
			<Calendar today={new Date()} schedule={data.schedule} {refreshPageData} />
		</div>
	</div>
</div>
