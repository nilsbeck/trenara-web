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
		<div class="flex flex-col items-center lg:flex-row">
			<Calendar today={new Date()} schedule={data.schedule} {refreshPageData} />
		</div>

		<!--
			A definite width, matching the calendar beside it. Without one this
			column is sized by its content, which means by the widest thing the
			cards happen to contain — and the cards line up with the calendar only
			by coincidence.
		-->
		<div class="hidden w-[28rem] min-w-0 max-w-full space-y-6 sm:block">
			{#if goal && isRenderableStats(userStats)}
				<GoalCard {goal} {userStats} />
				<PredictionsCard {userStats} />
			{:else}
				<p class="text-sm text-muted-foreground">Some data could not be loaded</p>
			{/if}
		</div>
	</div>
</div>
