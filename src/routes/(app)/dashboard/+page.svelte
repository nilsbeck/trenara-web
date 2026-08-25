<script lang="ts">
	import { invalidate } from '$app/navigation';
	import type { PageServerData } from './$types';
	import type { Goal, UserStats } from '$lib/server/trenara/types';
	import Calendar from '$lib/components/calendar/calendar.svelte';
	import GoalCard from '$lib/components/goal/goal-card.svelte';
	import PredictionsCard from '$lib/components/predictions/predictions-card.svelte';
	import { readPlanWeeks } from '$lib/utils/plan-weeks';

	let { data }: { data: PageServerData } = $props();

	// What a background refresh brought back, if one has. The cards read through
	// it to the load's own data, so they show something from the first paint and
	// move on quietly afterwards.
	let refreshed = $state<{ goal: Goal | null; userStats: UserStats | null } | null>(null);

	const goal = $derived(refreshed?.goal ?? data.goal);
	const userStats = $derived(refreshed?.userStats ?? data.userStats);

	// The shape of the plan, from a response this page already loads. Null stats
	// simply mean the calendar shows no week labels.
	const planWeeks = $derived(userStats ? readPlanWeeks(userStats.graph_stats?.goal) : null);

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

<div class="flex flex-col items-center justify-center md:flex-row">
	<div class="flex flex-col items-start justify-center md:flex-row md:space-x-6">
		<div class="flex flex-col items-center md:flex-row">
			<Calendar today={new Date()} schedule={data.schedule} {planWeeks} {refreshPageData} />
		</div>

		<div class="hidden space-y-6 sm:block">
			{#if goal && userStats}
				<GoalCard {goal} {userStats} />
				<PredictionsCard {userStats} />
			{:else}
				<p class="text-sm text-muted-foreground">Some data could not be loaded</p>
			{/if}
		</div>
	</div>
</div>
