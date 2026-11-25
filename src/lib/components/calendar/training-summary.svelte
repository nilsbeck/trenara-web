<script lang="ts">
	import type { Entry, ScheduledTraining } from '#lib/server/trenara/types.js';
	import {
		Activity,
		Bike,
		Check,
		Clock,
		Footprints,
		MessageCircle,
		Route,
		Star
	} from '@lucide/svelte';
	import SessionBlocks from '#lib/components/training/session-blocks.svelte';
	import SessionShapeBar from '#lib/components/training/session-shape-bar.svelte';
	import { trainingColor } from '#lib/utils/hex-color.js';
	import { activityIcon, sessionSummary } from '#lib/utils/session-setup.js';

	/**
	 * A day's session as `training-details.svelte` draws it, with none of what it
	 * does.
	 *
	 * For the offline calendar. The regular card is a store, a dozen requests
	 * and every control that changes a session — rating, moving, deleting, the
	 * setup rail, the cool-down toggle — and none of those can work without a
	 * connection, or should be offered against a copy of the plan that may no
	 * longer be the plan. So this is the same layout, drawn from the same
	 * payload, and that is all: no button, no store, no fetch. Keep it that way;
	 * a control added here is a change made against a plan nobody can check.
	 */
	let {
		training,
		entry
	}: {
		training: ScheduledTraining | null;
		entry: Entry | null;
	} = $props();

	const colour = $derived(training ? trainingColor(training) : null);
	const kind = $derived(activityIcon(training?.cross_type));
</script>

{#if !training && !entry}
	<div class="flex items-center justify-center py-8">
		<p class="text-sm text-muted-foreground">No training for this day.</p>
	</div>
{:else}
	<div class="flex flex-col gap-4">
		<div class="flex min-w-0 items-stretch gap-2">
			{#if entry}
				<Check class="mt-0.5 h-5 w-5 shrink-0 text-green-500" aria-hidden="true" />
			{:else if training && colour}
				<span class="w-[3px] shrink-0 self-stretch rounded-full" style="background-color: {colour}"
				></span>
				<span
					class="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg"
					style="background-color: color-mix(in srgb, {colour} 18%, transparent); color: {colour}"
				>
					{#if kind === 'bike'}
						<Bike class="h-4 w-4" />
					{:else if kind === 'run'}
						<Footprints class="h-4 w-4" />
					{:else}
						<Activity class="h-4 w-4" />
					{/if}
				</span>
			{/if}
			<div class="min-w-0 flex-1">
				<h3 class="text-base font-semibold text-foreground">
					{training?.title ?? entry?.name}
				</h3>
				{#if training}
					<p class="mt-0.5 text-xs tabular-nums text-muted-foreground">
						{sessionSummary(training)}
					</p>
					{#if !entry}
						<SessionShapeBar {training} />
					{/if}
				{/if}
			</div>
		</div>

		{#if training?.description}
			<div class="flex gap-2">
				<MessageCircle class="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
				<div class="rounded-xl rounded-tl-none bg-muted px-3 py-2">
					<p class="text-sm leading-relaxed text-foreground">{training.description}</p>
				</div>
			</div>
		{/if}

		{#if entry?.notification?.content}
			<div class="flex gap-2">
				<MessageCircle class="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
				<div class="rounded-xl rounded-tl-none bg-muted px-3 py-2">
					<p class="text-sm leading-relaxed text-foreground">{entry.notification.content}</p>
				</div>
			</div>
		{/if}

		{#if training?.training?.blocks && training.training.blocks.length > 0}
			<!-- No cool-down control: `-1` and the two `false`s draw the blocks only. -->
			<SessionBlocks
				blocks={training.training.blocks}
				cooldownIndex={-1}
				cooldownNeedsOwnRow={false}
				cooldownRemoved={false}
				cooldownPending={false}
				onCooldownChange={() => {}}
			/>
		{/if}

		<div>
			<h4 class="mb-2 text-sm font-medium text-foreground">Metrics</h4>
			<div class="overflow-hidden rounded-lg border border-border">
				<table class="w-full text-sm">
					<thead>
						<tr class="bg-muted">
							<th class="px-3 py-2 text-left font-medium text-muted-foreground">Metric</th>
							{#if training}
								<th class="px-3 py-2 text-right font-medium text-muted-foreground">Plan</th>
							{/if}
							{#if entry}
								<th class="px-3 py-2 text-right font-medium text-muted-foreground">Actual</th>
							{/if}
						</tr>
					</thead>
					<tbody>
						<tr class="border-t border-border">
							<td class="px-3 py-2 text-muted-foreground">
								<div class="flex items-center gap-1.5"><Route class="h-3.5 w-3.5" />Distance</div>
							</td>
							{#if training}
								<td class="px-3 py-2 text-right text-foreground"
									>{training.training?.total_distance ?? '-'}</td
								>
							{/if}
							{#if entry}
								<td class="px-3 py-2 text-right text-foreground">{entry.distance}</td>
							{/if}
						</tr>
						<tr class="border-t border-border">
							<td class="px-3 py-2 text-muted-foreground">
								<div class="flex items-center gap-1.5"><Clock class="h-3.5 w-3.5" />Time</div>
							</td>
							{#if training}
								<td class="px-3 py-2 text-right text-foreground"
									>{training.training?.total_time ?? '-'}</td
								>
							{/if}
							{#if entry}
								<td class="px-3 py-2 text-right text-foreground">{entry.time}</td>
							{/if}
						</tr>
						{#if entry}
							<tr class="border-t border-border">
								<td class="px-3 py-2 text-muted-foreground">
									<div class="flex items-center gap-1.5"><Star class="h-3.5 w-3.5" />RPE</div>
								</td>
								{#if training}
									<td class="px-3 py-2 text-right text-foreground">-</td>
								{/if}
								<td class="px-3 py-2 text-right text-foreground">{entry.rpe ?? '-'}</td>
							</tr>
						{/if}
					</tbody>
				</table>
			</div>
		</div>
	</div>
{/if}
