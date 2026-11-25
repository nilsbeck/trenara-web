<script lang="ts">
	import { invalidate } from '$app/navigation';
	import type { PageServerData } from './$types';
	import type { Goal, UserStats } from '#lib/server/trenara/types.js';
	import Calendar from '#lib/components/calendar/calendar.svelte';
	import GoalCardShare from '#lib/components/goal/goal-card-share.svelte';
	import DashboardColumns from '#lib/components/dashboard/dashboard-columns.svelte';
	import DashboardCards from '#lib/components/dashboard/dashboard-cards.svelte';

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
		<DashboardCards {goal} {userStats} history={history.records} historyError={history.error}>
			{#snippet headerExtra()}
				{#if goal}
					<GoalCardShare share={data.share} goalName={goal.name} />
				{/if}
			{/snippet}
		</DashboardCards>
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
