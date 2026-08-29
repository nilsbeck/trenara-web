<script lang="ts">
	import { invalidate } from '$app/navigation';
	import type { PageServerData } from './$types';
	import type { Goal, UserStats } from '$lib/server/trenara/types';
	import Calendar from '$lib/components/calendar/calendar.svelte';
	import GoalCard from '$lib/components/goal/goal-card.svelte';
	import PredictionsCard from '$lib/components/predictions/predictions-card.svelte';
	import { isRenderableStats } from '$lib/utils/user-stats';

	let { data }: { data: PageServerData } = $props();

	// What a background refresh brought back, if one has. The cards read through
	// it to the load's own data, so they show something from the first paint and
	// move on quietly afterwards.
	let refreshed = $state<{ goal: Goal | null; userStats: UserStats | null } | null>(null);

	const goal = $derived(refreshed?.goal ?? data.goal);
	const userStats = $derived(refreshed?.userStats ?? data.userStats);

	// Whether the goal card is open, on a phone. Closed to begin with: its head
	// carries the prediction, so opening it is for the graphs rather than for
	// the numbers. Ignored from `sm` up, where the cards are a column beside the
	// calendar and there is nothing to fold.
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
	<!--
		`gap` rather than `lg:space-x-6`: the columns stack until `lg`, and a
		horizontal-only rule left the cards sitting flush against the calendar at
		every width below it. One gap covers both directions.
	-->
	<div class="flex flex-col items-start justify-center gap-6 lg:flex-row">
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
				<!--
					The goal card folds down to its own head on a phone, and the
					predictions table folds with it: the two are one disclosure, opened
					by the head that stays put above them.
				-->
				<GoalCard
					{goal}
					{userStats}
					collapsible
					expanded={goalOpen}
					ontoggle={() => (goalOpen = !goalOpen)}
					bodyId="goal-card-body"
				/>

				<!--
					The gap between the cards is inside the fold, not above it, so a
					closed card is not left holding 24px of nothing open beneath it.
				-->
				<div
					class="grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none sm:visible sm:grid-rows-[1fr] sm:opacity-100 {goalOpen
						? 'visible grid-rows-[1fr] opacity-100'
						: 'invisible grid-rows-[0fr] opacity-0'}"
				>
					<div class="overflow-hidden sm:overflow-visible">
						<div class="pt-6">
							<PredictionsCard {userStats} />
						</div>
					</div>
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
