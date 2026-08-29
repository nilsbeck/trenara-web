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
	import { ChevronUp } from 'lucide-svelte';

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

	let strip = $state<{ focus: () => void } | null>(null);
	let collapse = $state<HTMLButtonElement | null>(null);

	// Which half was showing last time this ran. Deliberately not `$state`: it
	// is how the effect tells a real toggle from a re-run, and tracking it would
	// make every write schedule the next one.
	let wasOpen = false;

	/**
	 * Move focus to whichever control just replaced the one that was used.
	 *
	 * The two halves trade places rather than stacking, so the button a keyboard
	 * user just pressed is the one that folds away — and focus would land on the
	 * body, at the top of the document, with the newly opened card unreachable
	 * by anything but a fresh tab through the page.
	 *
	 * Only ever below `sm`: above it both controls are `display:none` and there
	 * is no way to reach this.
	 */
	$effect(() => {
		const open = goalOpen;
		if (open === wasOpen) return;
		wasOpen = open;
		if (open) collapse?.focus();
		else strip?.focus();
	});

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
					The strip and the cards are one control in two sizes, and they
					trade places rather than stack: the strip folds to nothing over
					the same 300ms the cards unfold from it, so the box between them
					interpolates from one height to the other and the small card is
					seen to become the large one.

					`grid-template-rows` from `0fr` to `1fr` is what makes that
					animatable — a plain `height: auto` is not — and the inner
					`overflow-hidden` is what the row clips against. The pair reads as
					a morph rather than as a swap because the strip's header and the
					goal card's are the same heading in two weights, landing in the
					same place: name, distance, how long is left.
				-->
				{#if summary}
					<div
						class="grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none sm:hidden {goalOpen
							? 'invisible grid-rows-[0fr] opacity-0'
							: 'visible grid-rows-[1fr] opacity-100'}"
					>
						<div class="overflow-hidden">
							<GoalSummary
								bind:this={strip}
								{summary}
								expanded={goalOpen}
								controls="goal-details"
								ontoggle={() => (goalOpen = !goalOpen)}
							/>
						</div>
					</div>
				{/if}

				<!--
					One instance of the cards at every width — below `sm` the half the
					strip unfolds into, above it simply the column. Two instances would
					be the simpler markup and would mount `GoalCard` twice, firing its
					prediction tracking and its goal archiving twice on every load.

					`invisible` rather than height alone, because a row clipped to zero
					still holds focusable controls and still reads to a screen reader.
					It is the one part of this that `sm` has to override, or the cards
					are laid out and never shown.
				-->
				<div
					id="goal-details"
					class="grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none sm:visible sm:grid-rows-[1fr] sm:opacity-100 {goalOpen
						? 'visible grid-rows-[1fr] opacity-100'
						: 'invisible grid-rows-[0fr] opacity-0'}"
				>
					<div class="overflow-hidden sm:overflow-visible">
						<!--
							The way back, in the place the strip's own chevron just left,
							so the control that closes this is where the one that opened
							it was rather than a screen's scrolling away at the foot of
							the cards.
						-->
						<div class="mb-3 flex justify-end sm:hidden">
							<button
								bind:this={collapse}
								type="button"
								onclick={() => (goalOpen = false)}
								class="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
							>
								<ChevronUp class="h-4 w-4" />
								Show less
							</button>
						</div>

						<div class="space-y-6">
							<GoalCard {goal} {userStats} />
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
