<script lang="ts">
	import type { PageServerData } from './$types';
	import GoalCard from '$lib/components/goal/goal-card.svelte';
	import PredictionsCard from '$lib/components/predictions/predictions-card.svelte';
	import { isRenderableStats } from '$lib/utils/user-stats';
	import { invalidateAll } from '$app/navigation';
	import { Loader2, ArrowLeft, RefreshCw } from 'lucide-svelte';

	let { data }: { data: PageServerData } = $props();
</script>

<div class="mx-auto max-w-4xl">
	<div class="mb-6">
		<a
			href="/dashboard"
			class="inline-flex items-center gap-1.5 rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
			aria-label="Back to dashboard"
		>
			<ArrowLeft class="h-5 w-5" />
		</a>
	</div>

	<!--
		The cards stretch rather than centre. Neither card carries a width of its
		own, so a centred column sized each one by its own content — and the
		predictions table is narrower than the goal card's, which left the two
		stacked cards visibly out of step.
	-->
	<div class="flex flex-col space-y-6">
		{#await Promise.all([data.goal, data.userStats])}
			<div class="flex items-center justify-center py-12">
				<Loader2 class="h-6 w-6 animate-spin text-muted-foreground" />
			</div>
		{:then [goal, userStats]}
			{#if goal && isRenderableStats(userStats)}
				<GoalCard {goal} {userStats} />
				<PredictionsCard {userStats} />
			{:else}
				<p class="text-center text-sm text-muted-foreground">No goal or stats data available.</p>
			{/if}
		{:catch failure}
			<!--
				The reason, not the fact.

				This said "Error loading goal/stats" whatever had happened, which
				told a runner nothing they could act on and told the maintainer
				nothing either — a rate limit, an outage and an expired session were
				one indistinguishable line. The message here is the one the server
				composed for exactly this, and it is on screen because branches are
				tried as preview deployments.
			-->
			<div class="space-y-3 py-8 text-center">
				<p class="text-sm text-destructive">
					{failure?.message ?? 'The goal and predictions could not be loaded.'}
				</p>
				<button
					type="button"
					onclick={() => invalidateAll()}
					class="inline-flex items-center justify-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
				>
					<RefreshCw class="h-3.5 w-3.5" aria-hidden="true" />
					Try again
				</button>
			</div>
		{/await}
	</div>
</div>
