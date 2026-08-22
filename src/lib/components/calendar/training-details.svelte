<script lang="ts">
	import type { ScheduledTraining, Entry } from '$lib/server/trenara/types';
	import {
		Activity,
		Bike,
		Footprints,
		MessageCircle,
		Clock,
		Route,
		Gauge,
		Check,
		Trash2,
		Loader2,
		Star,
		Repeat,
		TriangleAlert,
		X
	} from 'lucide-svelte';
	import GiveFeedbackModal from '$lib/components/modals/give-feedback-modal.svelte';
	import ChangeDateModal from '$lib/components/modals/change-date-modal.svelte';
	import RateTrainingInline from '$lib/components/training/rate-training-inline.svelte';
	import TreadmillMode from '$lib/components/training/treadmill-mode.svelte';
	import SessionShapeBar from '$lib/components/training/session-shape-bar.svelte';
	import SetupRail from '$lib/components/training/setup-rail.svelte';
	import SessionSetupSheet from '$lib/components/training/session-setup-sheet.svelte';
	import { SessionDetailStore } from '$lib/stores/session-detail.svelte';
	import CooldownBlock from '$lib/components/training/cooldown-block.svelte';
	import {
		activityIcon,
		cooldownBlockIndex,
		isRun,
		sessionSummary,
		type SettingKey
	} from '$lib/utils/session-setup';
	import { blockTypeColor } from '$lib/utils/block-color';

	let {
		selectedDate,
		training,
		entry,
		isLoading,
		onScheduleChanged,
		onTrainingChanged
	}: {
		selectedDate: string | null;
		training: ScheduledTraining | null;
		entry: Entry | null;
		isLoading: boolean;
		onScheduleChanged?: () => void;
		/** A change came back from the server; the week needs the newer copy. */
		onTrainingChanged?: (training: ScheduledTraining) => void;
	} = $props();

	// True when the entry exists but has no RPE rating yet
	const needsRating = $derived(entry != null && entry.rpe == null);

	let deleting = $state(false);
	let confirmingDelete = $state(false);

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

	// ── Session setup ──────────────────────────────────────────────
	//
	// The week payload carries none of the capability flags, so the setup
	// controls come from a separate detail fetch and appear a moment after the
	// rest of the card. Until then this renders the week's copy unchanged.
	const detailStore = new SessionDetailStore((updated) => onTrainingChanged?.(updated));

	let setupOpen = $state(false);
	let setupSection = $state<SettingKey | null>(null);

	$effect(() => {
		// Only worth fetching for a session the runner can still change.
		detailStore.load(training && entry === null ? training.id : null);
	});

	// The detail once it lands, the week's copy until then.
	const shownTraining = $derived(detailStore.detail ?? training);

	// The setup rail needs the flags, so it waits for the detail.
	const canShowSetup = $derived(
		detailStore.detail !== null && entry === null && detailStore.detail.can_be_edited
	);

	// Treadmill mode is only meaningful for a running session that hasn't been
	// completed yet. A cross-trained session has no pace to hold on a belt, so
	// the button goes with the rest of the running detail — and it goes as soon
	// as the swap lands, which is why this reads the detail rather than the week.
	const canUseTreadmillMode = $derived(
		shownTraining !== null && entry === null && isRun(shownTraining)
	);

	// ── Cool-down ──────────────────────────────────────────────────
	//
	// Only sessions that have a cool-down can drop one, and the API does not
	// flag which block it is, so the control attaches to the block we can
	// identify and falls back to its own row when we cannot.
	const canToggleCooldown = $derived(
		detailStore.detail !== null && entry === null && !!detailStore.detail.can_toggle_cooldown
	);

	const cooldownIndex = $derived(
		detailStore.detail && canToggleCooldown ? cooldownBlockIndex(detailStore.detail) : -1
	);

	/** True when the cool-down is on but its block could not be pointed at. */
	const cooldownNeedsOwnRow = $derived(
		canToggleCooldown && !!detailStore.detail?.has_cooldown && cooldownIndex === -1
	);

	/** True when the cool-down has been dropped, so the plan shows what is gone. */
	const cooldownRemoved = $derived(canToggleCooldown && !detailStore.detail?.has_cooldown);

	function setCooldown(next: boolean) {
		void detailStore.setCooldown(next);
	}

	// Whether the session itself can be replaced, which decides if its title is
	// a control or just a heading.
	const canChangeSession = $derived(
		canShowSetup &&
			!!detailStore.detail &&
			(!!detailStore.detail.can_cross_train || !!detailStore.detail.can_be_exchanged)
	);

	// The offer expires: an Undo still sitting there ten minutes later is not
	// about the tap that produced it any more.
	$effect(() => {
		if (!detailStore.undoable) return;
		const timer = setTimeout(() => detailStore.dismissUndo(), 8000);
		return () => clearTimeout(timer);
	});

	function openSetup(key: SettingKey | null) {
		setupSection = key;
		setupOpen = true;
	}

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
			<div class="flex min-w-0 items-stretch gap-2">
				{#if entry}
					<Check class="mt-0.5 h-5 w-5 shrink-0 text-green-500" />
				{:else if shownTraining}
					<!--
						hex_training is already per-workout-type and is the same value the
						mobile app paints, so the colour coding comes from the server. It
						is never used as text colour: several of those hues fail contrast
						on the charcoal ground — the rail and an 18% tint behind the icon
						carry it instead.
					-->
					<span
						class="w-[3px] shrink-0 self-stretch rounded-full"
						style="background-color: {shownTraining.hex_training}"
					></span>
					{#if !entry}
						{@const kind = activityIcon(shownTraining.cross_type)}
						<span
							class="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg"
							style="background-color: color-mix(in srgb, {shownTraining.hex_training} 18%, transparent); color: {shownTraining.hex_training}"
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
				{/if}
				<div class="min-w-0 flex-1">
					<div class="flex min-w-0 flex-wrap items-baseline gap-1.5">
						{#if canChangeSession && shownTraining}
							<!--
								The title is the session's badge, so by the same rule the chips
								follow it is also the way to change it. Burying the biggest
								change of all two taps deep, while the small tweaks sit on the
								card as chips, had it exactly backwards.
							-->
							<button
								type="button"
								onclick={() => openSetup('session')}
								class="group flex items-baseline gap-1.5 text-left"
							>
								<h3 class="text-base font-semibold text-foreground">{shownTraining.title}</h3>
								<Repeat
									class="h-3 w-3 shrink-0 self-center text-muted-foreground transition-colors group-hover:text-foreground"
								/>
							</button>
						{:else}
							<h3 class="text-base font-semibold text-foreground">
								{#if entry && !training}
									{entry.name}
								{:else if shownTraining}
									{shownTraining.title}
								{/if}
							</h3>
						{/if}
					</div>
					{#if shownTraining}
						<!--
							On its own line rather than crammed into the title at 10px in
							brackets. It is the first thing a runner checks about a session.
						-->
						<p class="mt-0.5 text-xs tabular-nums text-muted-foreground">
							{sessionSummary(shownTraining)}
						</p>
					{/if}
					{#if shownTraining && !entry}
						<SessionShapeBar training={shownTraining} />
					{/if}
				</div>
			</div>

			<!-- Action buttons -->
			<div class="flex items-center gap-1.5 shrink-0">
				{#if canUseTreadmillMode && shownTraining}
					<TreadmillMode training={shownTraining} />
				{/if}
				{#if entry && training}
					<GiveFeedbackModal {training} {entry} />
				{/if}
				{#if training?.can_be_edited}
					<ChangeDateModal
						{training}
						{selectedDate}
						onMoved={() => {
							onScheduleChanged?.();
						}}
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

		<!-- Session setup: what is applied, and the way to change it -->
		{#if canShowSetup && detailStore.detail}
			<SetupRail training={detailStore.detail} pending={detailStore.pending} onopen={openSetup} />

			<!--
				Setup errors are shown inside the sheet while it is open. The
				cool-down control sits on the block instead, out here, so without
				this a refused change looked exactly like a button doing nothing.
			-->
			{#if detailStore.undoable && !setupOpen}
				<!--
					Replacing a session rewrites every block, which is a lot for one
					tap — but it is reversible, so this stands in for a confirm dialog
					rather than making every deliberate swap answer one.
				-->
				<div
					class="mt-2 flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-xs"
					role="status"
				>
					<span class="flex-1 text-foreground">{detailStore.undoable.message}</span>
					<button
						type="button"
						onclick={() => detailStore.undo()}
						class="shrink-0 rounded-full border border-border px-2.5 py-0.5 font-medium text-foreground transition-colors hover:border-primary hover:text-primary"
					>
						Undo
					</button>
					<button
						type="button"
						onclick={() => detailStore.dismissUndo()}
						aria-label="Dismiss"
						class="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
					>
						<X class="h-3.5 w-3.5" />
					</button>
				</div>
			{/if}

			{#if detailStore.error && !setupOpen}
				<div
					class="mt-2 flex items-start gap-2 rounded-lg bg-destructive/15 px-3 py-2 text-xs text-foreground"
					role="status"
				>
					<TriangleAlert class="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
					<span class="flex-1">{detailStore.error}</span>
					<button
						type="button"
						onclick={() => detailStore.dismissError()}
						aria-label="Dismiss"
						class="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
					>
						<X class="h-3.5 w-3.5" />
					</button>
				</div>
			{/if}
			<SessionSetupSheet
				training={detailStore.detail}
				store={detailStore}
				bind:open={setupOpen}
				bind:section={setupSection}
			/>
		{/if}

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
			{#if shownTraining?.description}
				<div class="flex gap-2">
					<div class="mt-0.5 flex-shrink-0">
						<MessageCircle class="h-4 w-4 text-primary" />
					</div>
					<div class="rounded-xl rounded-tl-none bg-muted px-3 py-2">
						<p class="text-sm text-foreground leading-relaxed">{shownTraining.description}</p>
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
			{#if shownTraining?.training?.blocks && shownTraining.training.blocks.length > 0}
				<div class="flex flex-col gap-3">
					<h4 class="text-sm font-medium text-foreground">Training details</h4>
					{#each shownTraining.training.blocks as block, blockIndex}
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
											style="background-color: {blockTypeColor(
												block.blocks[block.blocks.length - 1]?.type
											)}"
										></div>
									</div>
									<span class="text-sm font-medium text-foreground">
										{#if block.text}
											{block.text}{#if block.repeat && block.repeat > 1}&nbsp;×{block.repeat}{/if}
										{:else}
											Block{#if block.repeat && block.repeat > 1}
												×{block.repeat}{/if}:
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
						{:else if blockIndex === cooldownIndex}
							<CooldownBlock
								hasCooldown={true}
								text={block.text ?? 'Cool-down'}
								color={blockTypeColor(block.type)}
								pending={detailStore.pending === 'cooldown'}
								onchange={setCooldown}
							/>
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

					{#if cooldownNeedsOwnRow}
						<!-- The session has a cool-down but did not name its block in a
						     way we recognise, so the control gets a row of its own rather
						     than being attached to whichever block happens to be last. -->
						<CooldownBlock
							hasCooldown={true}
							text="Cool-down"
							color={blockTypeColor('cooldown')}
							pending={detailStore.pending === 'cooldown'}
							onchange={setCooldown}
						/>
					{/if}

					{#if cooldownRemoved}
						<!-- Removed, the cool-down stays in place as a ghost: the plan shows
						     what is missing and offers it straight back. -->
						<CooldownBlock
							hasCooldown={false}
							text="Cool-down removed"
							color={blockTypeColor('cooldown')}
							pending={detailStore.pending === 'cooldown'}
							onchange={setCooldown}
						/>
					{/if}
				</div>
			{/if}

			<!-- Plan vs Actual metrics table -->
			{#if shownTraining || entry}
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
											{shownTraining?.training?.total_distance ?? '-'}
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
											{shownTraining?.training?.core_distance ?? '-'}
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
											{shownTraining?.training?.total_time ?? '-'}
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
										<td class="px-3 py-2 text-right text-foreground"
											>{entry.avg_heartbeat ?? '-'}</td
										>
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
										<td class="px-3 py-2 text-right text-foreground"
											>{entry.total_altitude ?? '-'}</td
										>
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
