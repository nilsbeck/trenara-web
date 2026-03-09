<script lang="ts">
	import type { ScheduledTraining, Entry } from '$lib/server/trenara/types';
	import { MessageCircle, Clock, Route, Gauge, Check, Trash2, Loader2, Star } from 'lucide-svelte';
	import GiveFeedbackModal from '$lib/components/modals/give-feedback-modal.svelte';
	import ChangeDateModal from '$lib/components/modals/change-date-modal.svelte';
	import RateTrainingInline from '$lib/components/training/rate-training-inline.svelte';

	let {
		selectedDate,
		training,
		entry,
		isLoading,
		onScheduleChanged
	}: {
		selectedDate: string | null;
		training: ScheduledTraining | null;
		entry: Entry | null;
		isLoading: boolean;
		onScheduleChanged?: () => void;
	} = $props();

	// True when the entry exists but has no RPE rating yet
	const needsRating = $derived(entry != null && entry.rpe == null);

	let deleting = $state(false);
	let confirmingDelete = $state(false);

	/** Map a block type string to a display colour. */
	function blockTypeColor(type: string | undefined): string {
		if (!type) return '#60a5fa';
		const t = type.toLowerCase();
		if (t.includes('warm') || t.includes('cool')) return '#60a5fa'; // blue
		if (t === 'run' || t === 'easy' || t === 'jog') return '#facc15'; // yellow
		if (t === 'tempo' || t === 'fast' || t === 'threshold') return '#f97316'; // orange
		if (t === 'interval' || t === 'rep') return '#a855f7'; // purple
		if (t === 'rest' || t === 'recovery' || t === 'walk') return '#94a3b8'; // slate
		if (t === 'block') return '#4ade80'; // green
		return '#60a5fa'; // default blue
	}

	// True when selectedDate is today or in the future
	const isTodayOrFuture = $derived.by(() => {
		if (!selectedDate) return false;
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const [y, m, d] = selectedDate.split('-').map(Number);
		return new Date(y, m - 1, d) >= today;
	});

	// Show delete only for scheduled (unexecuted) trainings on today or future dates
	const canDelete = $derived(training !== null && entry === null && isTodayOrFuture);

	// Reset confirmation state whenever the training changes (user navigates to another day)
	$effect(() => {
		const _t = training?.id;
		confirmingDelete = false;
	});

	async function handleDelete() {
		if (!training) return;

		deleting = true;
		confirmingDelete = false;
		try {
			const res = await fetch('/api/v1/training/delete', {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ trainingId: training.id, type: 'scheduled' })
			});

			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				throw new Error(data.message ?? `Failed to delete training (${res.status})`);
			}

			onScheduleChanged?.();
		} catch (e) {
			alert(e instanceof Error ? e.message : 'Failed to delete training');
		} finally {
			deleting = false;
		}
	}
</script>

{#if isLoading}
	<div class="flex items-center justify-center py-8">
		<p class="text-sm text-muted-foreground">Loading...</p>
	</div>
{:else if !training && !entry}
	<div class="flex items-center justify-center py-8">
		{#if selectedDate}
			<p class="text-sm text-muted-foreground">No training scheduled for this day.</p>
		{:else}
			<p class="text-sm text-muted-foreground">Select a date to see training details.</p>
		{/if}
	</div>
{:else}
	<div class="flex flex-col gap-4">
		<!-- Title + action buttons -->
		<div class="flex items-start justify-between gap-2">
			<div class="flex items-center gap-2 min-w-0">
				{#if entry}
					<Check class="h-5 w-5 shrink-0 text-green-500" />
				{/if}
				<div class="min-w-0 flex items-baseline gap-1.5 flex-wrap">
					<h3 class="text-base font-semibold text-foreground">
						{#if entry && !training}
							{entry.name}
						{:else if training}
							{training.title}
						{/if}
					</h3>
					{#if training}
						<span class="text-[10px] text-muted-foreground whitespace-nowrap">
							[{training.training.total_distance}, {training.training.total_time}{training.training.total_time.split(':').length === 2 ? 'min' : 'h'}]
						</span>
					{/if}
				</div>
			</div>

			<!-- Action buttons -->
			<div class="flex items-center gap-1.5 shrink-0">
				{#if entry && training}
					<GiveFeedbackModal {training} {entry} />
				{/if}
				{#if training?.can_be_edited}
					<ChangeDateModal
						{training}
						{selectedDate}
						onMoved={() => { onScheduleChanged?.(); }}
					/>
				{/if}
				{#if canDelete}
					{#if confirmingDelete}
						<!-- Inline confirmation -->
						<div class="flex items-center gap-1">
							<span class="text-xs text-muted-foreground pr-1">Remove?</span>
							<button
								type="button"
								onclick={handleDelete}
								disabled={deleting}
								class="rounded-md px-2 py-1 text-xs font-medium bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50 transition-colors"
							>
								{#if deleting}
									<Loader2 class="h-3 w-3 animate-spin" />
								{:else}
									Yes
								{/if}
							</button>
							<button
								type="button"
								onclick={() => (confirmingDelete = false)}
								class="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
							>
								No
							</button>
						</div>
					{:else}
						<button
							type="button"
							onclick={() => (confirmingDelete = true)}
							class="rounded-md p-2.5 text-muted-foreground hover:bg-muted hover:text-destructive transition-colors"
							aria-label="Delete training"
						>
							<Trash2 class="h-5 w-5" />
						</button>
					{/if}
				{/if}
			</div>
		</div>

		<!-- Inline rating prompt (shown when training is completed but not yet rated) -->
		{#if needsRating && entry && training}
			<RateTrainingInline {entry} />
		{/if}

		<!-- Training detail content — blurred when rating is pending -->
		<div
			class="flex flex-col gap-4 transition-all duration-500"
			class:details-blurred={needsRating}
		>
			<!-- Coach message bubble -->
			{#if training?.description}
				<div class="flex gap-2">
					<div class="mt-0.5 flex-shrink-0">
						<MessageCircle class="h-4 w-4 text-primary" />
					</div>
					<div class="rounded-xl rounded-tl-none bg-muted px-3 py-2">
						<p class="text-sm text-foreground leading-relaxed">{training.description}</p>
					</div>
				</div>
			{/if}

			<!-- Entry notification (coach feedback after completion) -->
			{#if entry?.notification?.content}
				<div class="flex gap-2">
					<div class="mt-0.5 flex-shrink-0">
						<MessageCircle class="h-4 w-4 text-primary" />
					</div>
					<div class="rounded-xl rounded-tl-none bg-muted px-3 py-2">
						<p class="text-sm text-foreground leading-relaxed">{entry.notification.content}</p>
					</div>
				</div>
			{/if}

			<!-- Training blocks -->
			{#if training?.training?.blocks && training.training.blocks.length > 0}
				<div class="flex flex-col gap-3">
					<h4 class="text-sm font-medium text-foreground">Training details</h4>
					{#each training.training.blocks as block}
						{#if block.blocks && block.blocks.length > 0}
							<!-- Composite block (intervals / repeat sets) -->
							<div class="flex flex-col gap-1.5">
								<!-- Header row: split-colour circle + label -->
								<div class="flex items-center gap-2.5">
									<div class="relative h-4 w-4 shrink-0 overflow-hidden rounded-full">
										<div
											class="absolute inset-0 right-1/2"
											style="background-color: {blockTypeColor(block.blocks[0]?.type)}"
										></div>
										<div
											class="absolute inset-0 left-1/2"
											style="background-color: {blockTypeColor(block.blocks[block.blocks.length - 1]?.type)}"
										></div>
									</div>
									<span class="text-sm font-medium text-foreground">
										{#if block.text}
											{block.text}{#if block.repeat && block.repeat > 1}&nbsp;×{block.repeat}{/if}
										{:else}
											Block{#if block.repeat && block.repeat > 1} ×{block.repeat}{/if}:
										{/if}
									</span>
								</div>
								<!-- Sub-blocks with coloured vertical bar -->
								<div class="ml-[26px] flex flex-col gap-1">
									{#each block.blocks as sub}
										<div class="flex items-start gap-2 text-sm">
											<div
												class="mt-[4px] w-[3px] shrink-0 self-stretch rounded-full"
												style="background-color: {blockTypeColor(sub.type)}; min-height: 12px"
											></div>
											<span class="leading-snug text-foreground">{sub.text}</span>
										</div>
									{/each}
								</div>
							</div>
						{:else}
							<!-- Simple block: solid circle + text -->
							<div class="flex items-center gap-2.5 text-sm">
								<div
									class="h-4 w-4 shrink-0 rounded-full"
									style="background-color: {blockTypeColor(block.type)}"
								></div>
								<span class="text-foreground">{block.text}</span>
							</div>
						{/if}
					{/each}
				</div>
			{/if}

			<!-- Plan vs Actual metrics table -->
			{#if training || entry}
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
										<div class="flex items-center gap-1.5">
											<Route class="h-3.5 w-3.5" />
											Distance
										</div>
									</td>
									{#if training}
										<td class="px-3 py-2 text-right text-foreground">
											{training.training?.total_distance ?? '-'}
										</td>
									{/if}
									{#if entry}
										<td class="px-3 py-2 text-right text-foreground">{entry.distance}</td>
									{/if}
								</tr>
								<tr class="border-t border-border">
									<td class="px-3 py-2 text-muted-foreground">
										<div class="flex items-center gap-1.5">
											<Route class="h-3.5 w-3.5" />
											Core
										</div>
									</td>
									{#if training}
										<td class="px-3 py-2 text-right text-foreground">
											{training.training?.core_distance ?? '-'}
										</td>
									{/if}
									{#if entry}
										<td class="px-3 py-2 text-right text-foreground">-</td>
									{/if}
								</tr>
								<tr class="border-t border-border">
									<td class="px-3 py-2 text-muted-foreground">
										<div class="flex items-center gap-1.5">
											<Clock class="h-3.5 w-3.5" />
											Time
										</div>
									</td>
									{#if training}
										<td class="px-3 py-2 text-right text-foreground">
											{training.training?.total_time ?? '-'}
										</td>
									{/if}
									{#if entry}
										<td class="px-3 py-2 text-right text-foreground">{entry.time}</td>
									{/if}
								</tr>
								<tr class="border-t border-border">
									<td class="px-3 py-2 text-muted-foreground">
										<div class="flex items-center gap-1.5">
											<Gauge class="h-3.5 w-3.5" />
											Heartrate
										</div>
									</td>
									{#if training}
										<td class="px-3 py-2 text-right text-foreground">-</td>
									{/if}
									{#if entry}
										<td class="px-3 py-2 text-right text-foreground">{entry.avg_heartbeat ?? '-'}</td>
									{/if}
								</tr>
								<tr class="border-t border-border">
									<td class="px-3 py-2 text-muted-foreground">
										<div class="flex items-center gap-1.5">
											<Gauge class="h-3.5 w-3.5" />
											Elevation
										</div>
									</td>
									{#if training}
										<td class="px-3 py-2 text-right text-foreground">-</td>
									{/if}
									{#if entry}
										<td class="px-3 py-2 text-right text-foreground">{entry.total_altitude ?? '-'}</td>
									{/if}
								</tr>
								{#if entry}
									<tr class="border-t border-border">
										<td class="px-3 py-2 text-muted-foreground">
											<div class="flex items-center gap-1.5">
												<Star class="h-3.5 w-3.5" />
												RPE
											</div>
										</td>
										{#if training}
											<td class="px-3 py-2 text-right text-foreground">-</td>
										{/if}
										<td class="px-3 py-2 text-right">
											{#if entry.rpe != null}
												<span class="font-medium text-foreground">{entry.rpe}</span>
												<span class="text-xs text-muted-foreground">/10</span>
											{:else}
												<span class="text-muted-foreground">-</span>
											{/if}
										</td>
									</tr>
								{/if}
							</tbody>
						</table>
					</div>
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	.details-blurred {
		filter: blur(4px);
		opacity: 0.5;
		pointer-events: none;
		user-select: none;
	}
</style>
