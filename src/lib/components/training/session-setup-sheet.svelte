<script lang="ts">
	import type { ScheduledTraining, Shoe } from '$lib/server/trenara/types';
	import type { TrainingHeightDifference, TrainingSurface } from '$lib/server/trenara/types';
	import {
		Check,
		ChevronLeft,
		ChevronRight,
		Footprints,
		Gauge,
		Loader2,
		Mountain,
		MoveHorizontal,
		Repeat,
		X
	} from 'lucide-svelte';
	import CooldownIcon from '$lib/components/icons/cooldown-icon.svelte';
	import type { SessionDetailStore } from '$lib/stores/session-detail.svelte';
	import {
		ACTIVITIES,
		HEIGHT_DIFFERENCES,
		SURFACES,
		UNMAPPED_ACTIVITIES,
		activityLabel,
		conditionClimb,
		elevationBand,
		isRun,
		metresPerKm,
		selectedStep,
		sessionSettings,
		shoeName,
		shoeTypeLabel,
		type SettingKey
	} from '$lib/utils/session-setup';

	let {
		training,
		store,
		open = $bindable(false),
		section = $bindable<SettingKey | null>(null)
	}: {
		training: ScheduledTraining;
		store: SessionDetailStore;
		open: boolean;
		/** Which editor to show. `null` is the index. */
		section: SettingKey | null;
	} = $props();

	let dialogEl: HTMLDialogElement | undefined = $state();

	// Terrain posts surface, elevation and climb in one call, so all three are
	// staged until Apply rather than committing a half-set condition on the
	// first tap.
	let stagedSurface = $state<TrainingSurface>('road');
	let stagedHeight = $state<TrainingHeightDifference>('flat');
	/**
	 * Bound to a number input, which Svelte coerces for us — so an emptied field
	 * arrives as null rather than an empty string, and that is a field mid-edit
	 * rather than a mistake.
	 */
	let stagedClimb = $state<number | null>(0);

	const climbMetres = $derived(stagedClimb ?? 0);

	// What the entered ascent works out to against this session's distance, and
	// which of the four bands that lands in. Shown, never applied: the runner
	// knows their route, and a session can be flat overall with one steep climb.
	const climbPerKm = $derived(metresPerKm(training, climbMetres));
	const climbBandLabel = $derived(
		climbPerKm == null
			? null
			: (HEIGHT_DIFFERENCES.find((h) => h.value === elevationBand(climbPerKm))?.label ?? null)
	);
	const climbValid = $derived(
		stagedClimb === null ||
			(Number.isFinite(stagedClimb) && stagedClimb >= 0 && stagedClimb <= 30000)
	);

	const settings = $derived(sessionSettings(training));
	const tuneSettings = $derived(settings.filter((s) => !s.replace && !s.inline));
	const replaceSettings = $derived(settings.filter((s) => s.replace));
	const cooldown = $derived(settings.find((s) => s.key === 'cooldown') ?? null);

	const intensityPackage = $derived(training.change_intensity_package ?? null);
	const distancePackage = $derived(training.change_distance_package ?? null);

	const TITLES: Record<SettingKey, string> = {
		terrain: 'Terrain',
		shoe: 'Shoe',
		effort: 'Fine-tune intensity',
		volume: 'Fine-tune distance',
		cooldown: 'Cool-down',
		session: 'Change this session'
	};

	const title = $derived.by(() => {
		if (!section) return 'Session setup';
		// The package carries the coach's own wording, which differs per session:
		// a distance package calls itself "Fine-tune intervals" on an interval
		// session. Prefer it over anything we would hardcode.
		if (section === 'effort' && intensityPackage?.title) return intensityPackage.title;
		if (section === 'volume' && distancePackage?.title) return distancePackage.title;
		return TITLES[section];
	});

	const ICONS = {
		terrain: Mountain,
		shoe: Footprints,
		effort: Gauge,
		volume: MoveHorizontal,
		cooldown: Gauge,
		session: Repeat
	} as const;

	/** The shoe Trenara recommended, pinned to the top of the picker. */
	const recommendedShoeId = $derived(training.suggested_shoe?.id ?? null);

	const orderedShoes = $derived.by(() => {
		const shoes = (store.shoes ?? []).filter((s) => !s.retired_at);
		const recommended = shoes.filter((s) => s.id === recommendedShoeId);
		const rest = shoes.filter((s) => s.id !== recommendedShoeId);
		// Nothing in the payload says which shoe suits which session, so the rest
		// keep the order the API sent rather than an order we invented.
		return [...recommended, ...rest];
	});

	$effect(() => {
		const el = dialogEl;
		if (!el) return;
		// Only act on an actual change: showModal() on an open dialog throws
		// InvalidStateError, and close() on a closed one is a no-op worth skipping.
		if (open && !el.open) el.showModal();
		else if (!open && el.open) el.close();
	});

	$effect(() => {
		if (section !== 'terrain') return;
		// Reads can carry a value we do not know — the API can add one at any
		// time — and a write is required to name a known elevation. So the
		// staged pair falls back rather than casting an unrecognised label
		// through and having the post rejected for a field the runner never
		// touched.
		const condition = training.training_condition;
		stagedSurface = SURFACES.some((s) => s.value === condition?.surface)
			? (condition!.surface as TrainingSurface)
			: 'road';
		stagedHeight = HEIGHT_DIFFERENCES.some((h) => h.value === condition?.height_difference)
			? (condition!.height_difference as TrainingHeightDifference)
			: 'flat';
		stagedClimb = conditionClimb(training);
	});

	$effect(() => {
		if (section === 'shoe') void store.loadShoes();
		if (section === 'session') void store.loadCandidates();
	});

	function close() {
		open = false;
		section = null;
	}

	function shoeWearPercent(shoe: Shoe): number {
		return Math.min(Math.round(shoe.lifetime_percentage), 100);
	}

	async function commitAndClose(run: () => Promise<boolean>) {
		if (await run()) close();
	}
</script>

<dialog
	bind:this={dialogEl}
	onclose={close}
	onclick={(e) => {
		if (e.target === dialogEl) close();
	}}
	class="m-0 mt-auto w-full max-w-lg rounded-t-2xl border border-border bg-card p-0 text-card-foreground backdrop:bg-black/60 sm:mx-auto sm:mb-auto sm:mt-24 sm:rounded-2xl"
>
	<div class="flex items-center gap-2 border-b border-border px-4 py-3">
		{#if section}
			<button
				type="button"
				onclick={() => (section = null)}
				aria-label="Back"
				class="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
			>
				<ChevronLeft class="h-4 w-4" />
			</button>
		{/if}
		<h3 class="flex-1 text-base font-semibold">{title}</h3>
		<button
			type="button"
			onclick={close}
			aria-label="Close"
			class="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
		>
			<X class="h-4 w-4" />
		</button>
	</div>

	<div class="max-h-[70vh] overflow-y-auto px-4 pb-5 pt-3">
		<!-- Only while the sheet is actually open: a closed dialog still holds its
		     content, and the card shows the same error out there. -->
		{#if store.error && open}
			<p class="mb-3 rounded-lg bg-destructive/15 px-3 py-2 text-xs text-destructive-foreground">
				{store.error}
			</p>
		{/if}

		{#if section === null}
			<p class="mb-3 text-xs leading-relaxed text-muted-foreground">
				Everything your coach allows on this session. Options the coach has locked are not listed.
			</p>

			<div class="flex flex-col">
				{#each tuneSettings as setting (setting.key)}
					{@const Icon = ICONS[setting.key]}
					<button
						type="button"
						onclick={() => (section = setting.key)}
						class="flex w-full items-center gap-3 border-b border-border px-1 py-3 text-left text-sm transition-colors last:border-b-0 hover:bg-foreground/5"
					>
						<Icon class="h-4 w-4 shrink-0 text-muted-foreground" />
						<span class="flex-1">{setting.label}</span>
						<span
							class="text-xs"
							class:text-primary={setting.changed}
							class:text-muted-foreground={!setting.changed}
						>
							{setting.value ?? 'Not set'}
						</span>
						<ChevronRight class="h-4 w-4 shrink-0 text-border" />
					</button>
				{/each}
			</div>

			{#if cooldown}
				<!--
					The index is the full inventory of what this session allows, so the
					cool-down is listed here too — but as a switch rather than a
					drill-in, and the control a runner actually reaches for is the one on
					the block itself, where the change can be seen happening.
				-->
				<button
					type="button"
					disabled={store.pending === 'cooldown'}
					onclick={() => store.setCooldown(!training.has_cooldown)}
					class="flex w-full items-center gap-3 border-t border-border px-1 py-3 text-left text-sm disabled:opacity-60"
				>
					<CooldownIcon class="h-4 w-4 shrink-0 text-muted-foreground" />
					<span class="flex-1">
						Cool-down
						<span class="block text-[11px] text-muted-foreground">
							{training.has_cooldown ? 'Part of this session' : 'Removed from this session'}
						</span>
					</span>
					{#if store.pending === 'cooldown'}
						<Loader2 class="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
					{:else}
						<span
							class="relative h-5 w-9 shrink-0 rounded-full border transition-colors {training.has_cooldown
								? 'border-primary bg-primary/30'
								: 'border-border bg-muted'}"
						>
							<span
								class="absolute top-[2px] h-[15px] w-[15px] rounded-full transition-all {training.has_cooldown
									? 'left-[17px] bg-primary'
									: 'left-[2px] bg-muted-foreground'}"
							></span>
						</span>
					{/if}
				</button>
			{/if}

			{#if replaceSettings.length > 0}
				<div class="mt-4 border-t border-border pt-3">
					<p class="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
						Replace this session
					</p>
					<div class="flex flex-col">
						{#each replaceSettings as setting (setting.key)}
							{@const Icon = ICONS[setting.key]}
							<button
								type="button"
								onclick={() => (section = setting.key)}
								class="flex w-full items-center gap-3 border-b border-border px-1 py-3 text-left text-sm transition-colors last:border-b-0 hover:bg-foreground/5"
							>
								<Icon class="h-4 w-4 shrink-0 text-muted-foreground" />
								<span class="flex-1">{setting.label}</span>
								<span
									class="text-xs"
									class:text-primary={setting.changed}
									class:text-muted-foreground={!setting.changed}>{setting.value}</span
								>
								<ChevronRight class="h-4 w-4 shrink-0 text-border" />
							</button>
						{/each}
					</div>
				</div>
			{/if}
		{:else if section === 'terrain'}
			<p class="mb-3 text-xs leading-relaxed text-muted-foreground">
				Where you are running today. All of it goes up in one call, so the sheet stays open until
				you apply it.
			</p>

			<p class="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
				Surface
			</p>
			<div class="grid grid-cols-3 gap-1.5">
				{#each SURFACES as surface (surface.value)}
					<button
						type="button"
						onclick={() => (stagedSurface = surface.value)}
						aria-pressed={stagedSurface === surface.value}
						class="rounded-lg border px-1 py-2.5 text-[11px] transition-colors {stagedSurface ===
						surface.value
							? 'border-primary bg-primary/10 text-foreground'
							: 'border-border bg-muted text-muted-foreground hover:text-foreground'}"
					>
						{surface.label}
					</button>
				{/each}
			</div>

			<p class="mb-2 mt-4 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
				Elevation
			</p>
			<div class="grid grid-cols-2 gap-1.5">
				{#each HEIGHT_DIFFERENCES as height (height.value)}
					<button
						type="button"
						onclick={() => (stagedHeight = height.value)}
						aria-pressed={stagedHeight === height.value}
						class="rounded-lg border px-2 py-2 text-[11px] transition-colors {stagedHeight ===
						height.value
							? 'border-primary bg-primary/10 text-foreground'
							: 'border-border bg-muted text-muted-foreground hover:text-foreground'}"
					>
						{height.label}
						<!-- The scale is only useful if it says what it measures. These are
						     the thresholds the app publishes beside these same options. -->
						<span class="mt-0.5 block text-[10px] opacity-70">{height.detail}</span>
					</button>
				{/each}
			</div>

			<label class="mt-4 block">
				<span
					class="mb-2 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
				>
					Altitude
				</span>
				<span class="flex items-center gap-2 rounded-lg border border-border bg-muted px-3 py-2">
					<input
						type="number"
						inputmode="numeric"
						min="0"
						max="30000"
						step="10"
						bind:value={stagedClimb}
						placeholder="0"
						class="w-full min-w-0 bg-transparent text-sm text-foreground outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
					/>
					<span class="shrink-0 text-xs text-muted-foreground">m</span>
				</span>
				<span class="mt-1.5 block text-[11px] text-muted-foreground">
					{#if !climbValid}
						<span class="text-destructive">Enter the altitude in metres, 0 or more.</span>
					{:else if climbPerKm != null}
						{Math.round(climbPerKm)} m D+ per km over this session{#if climbBandLabel && elevationBand(climbPerKm) !== stagedHeight}
							&nbsp;— that reads as <span class="text-foreground">{climbBandLabel}</span>{/if}.
					{:else}
						Metres of ascent, if you know it. Leave at 0 if you don’t.
					{/if}
				</span>
			</label>

			<div class="mt-4 flex justify-end">
				<button
					type="button"
					disabled={store.pending === 'terrain' || !climbValid}
					onclick={() =>
						commitAndClose(() => store.setTerrain(stagedSurface, stagedHeight, climbMetres))}
					class="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition-opacity disabled:opacity-60"
				>
					{#if store.pending === 'terrain'}
						<Loader2 class="h-3 w-3 animate-spin" />
					{/if}
					Apply
				</button>
			</div>
		{:else if section === 'effort' && intensityPackage}
			<p class="mb-3 text-xs leading-relaxed text-muted-foreground">{intensityPackage.text}</p>
			<div class="flex gap-1.5">
				{#each intensityPackage.steps as step (step.step)}
					<button
						type="button"
						disabled={store.pending === 'effort'}
						onclick={() => store.setEffort(step.value)}
						aria-pressed={step.selected}
						class="flex-1 rounded-lg border px-1 py-2.5 text-[11px] font-medium transition-colors disabled:opacity-60 {step.selected
							? 'border-primary bg-primary/10 text-foreground'
							: 'border-border bg-muted text-muted-foreground hover:text-foreground'}"
					>
						{step.text}
					</button>
				{/each}
			</div>
			<p class="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
				{#if store.pending === 'effort'}
					<Loader2 class="h-3 w-3 animate-spin" /> Saving…
				{:else}
					Now {training.training.total_distance ?? ''}
					{training.training.total_distance ? '·' : ''}
					{training.training.total_time}
				{/if}
			</p>
		{:else if section === 'volume' && distancePackage}
			<p class="mb-3 text-xs leading-relaxed text-muted-foreground">{distancePackage.text}</p>
			<div class="flex gap-1.5">
				{#each distancePackage.steps as step (step.step)}
					<button
						type="button"
						disabled={store.pending === 'volume'}
						onclick={() => store.setVolume(step.value)}
						aria-pressed={step.selected}
						class="flex-1 rounded-lg border px-1 py-2.5 text-[11px] font-medium transition-colors disabled:opacity-60 {step.selected
							? 'border-primary bg-primary/10 text-foreground'
							: 'border-border bg-muted text-muted-foreground hover:text-foreground'}"
					>
						{step.text}
					</button>
				{/each}
			</div>
			<p class="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
				{#if store.pending === 'volume'}
					<Loader2 class="h-3 w-3 animate-spin" /> Saving…
				{:else}
					Now {training.training.total_distance ?? ''}
					{training.training.total_distance ? '·' : ''}
					{training.training.total_time}
				{/if}
			</p>
		{:else if section === 'shoe'}
			<p class="mb-3 text-xs leading-relaxed text-muted-foreground">
				{recommendedShoeId
					? 'Trenara’s recommendation for this session sits at the top.'
					: 'No recommendation on this session.'} Wear is under each pair, so a shoe near the end of its
				life is visible before you pick it.
			</p>

			{#if store.shoes === null}
				<!-- The locker is a separate fetch, made the first time this section
				     opens. A spinner says the list is coming; bare text read as the
				     answer itself. -->
				<p
					class="flex items-center justify-center gap-2 py-4 text-xs text-muted-foreground"
					role="status"
				>
					<Loader2 class="h-3.5 w-3.5 animate-spin" />
					Loading your shoes…
				</p>
			{:else if orderedShoes.length === 0}
				<p class="py-4 text-center text-xs text-muted-foreground">No shoes in your locker yet.</p>
			{:else}
				{#each orderedShoes as shoe (shoe.id)}
					{@const wear = shoeWearPercent(shoe)}
					<button
						type="button"
						disabled={store.pending === 'shoe'}
						onclick={() => commitAndClose(() => store.setShoe(shoe.id))}
						class="flex w-full items-center gap-2.5 rounded-lg border p-2 text-left transition-colors disabled:opacity-60 {training
							.suggested_shoe?.id === shoe.id
							? 'border-primary/50 bg-primary/5'
							: 'border-transparent hover:bg-foreground/5'}"
					>
						<Footprints class="h-4 w-4 shrink-0 text-muted-foreground" />
						<span class="min-w-0 flex-1">
							<span class="flex flex-wrap items-center gap-1.5 text-sm">
								{shoeName(shoe)}
								<span
									class="rounded bg-muted px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground"
								>
									{shoeTypeLabel(shoe.type)}
								</span>
								{#if shoe.id === recommendedShoeId}
									<span
										class="rounded bg-primary/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-primary"
									>
										Recommended
									</span>
								{/if}
							</span>
							<span class="block text-[11px] text-muted-foreground">
								{shoe.distance_done} of {shoe.expected_lifetime_distance} · {wear}%
							</span>
							<span class="mt-1 block h-0.5 overflow-hidden rounded-full bg-muted">
								<span
									class="block h-full"
									class:bg-muted-foreground={wear < 70}
									class:bg-yellow-500={wear >= 70}
									style="width: {wear}%"
								></span>
							</span>
						</span>
						{#if store.pending === 'shoe'}
							<Loader2 class="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
						{:else if training.suggested_shoe?.id === shoe.id}
							<Check class="h-4 w-4 shrink-0 text-primary" />
						{/if}
					</button>
				{/each}
			{/if}
		{:else if section === 'session'}
			<p class="mb-3 text-xs leading-relaxed text-muted-foreground">
				Anything else your coach accepts today. All of it rewrites every block, and you can come
				back — nothing here is a one-way door.
			</p>

			{#if training.can_be_exchanged}
				<p
					class="mb-1 mt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
				>
					Another session
				</p>
				{#if store.candidates === null}
					<p
						class="flex items-center justify-center gap-2 py-3 text-xs text-muted-foreground"
						role="status"
					>
						<Loader2 class="h-3.5 w-3.5 animate-spin" />
						Loading alternatives…
					</p>
				{:else if store.candidates.length === 0}
					<p class="py-3 text-center text-xs text-muted-foreground">
						No alternatives offered for this session.
					</p>
				{:else}
					{#each store.candidates as candidate (candidate.id)}
						<button
							type="button"
							disabled={store.pending === 'session'}
							onclick={() => commitAndClose(() => store.exchange(candidate.id))}
							class="flex w-full items-center gap-2.5 rounded-lg border border-transparent p-2 text-left transition-colors hover:bg-foreground/5 disabled:opacity-60"
						>
							<span
								class="h-8 w-1 shrink-0 rounded-full"
								style="background-color: {candidate.hex_training}"
							></span>
							<span class="min-w-0 flex-1">
								<span class="block text-sm">{candidate.title}</span>
								<span class="block text-[11px] text-muted-foreground">
									{candidate.training.total_distance ?? activityLabel(candidate.cross_type)} · {candidate
										.training.total_time}
								</span>
							</span>
							<ChevronRight class="h-4 w-4 shrink-0 text-border" />
						</button>
					{/each}
				{/if}
			{/if}

			{#if training.can_cross_train}
				<!--
					A different sport rather than a different session: same training
					load, no distance or pace. Grouped by what it is to a runner, not
					by which endpoint answers it — that part is ours to hide.
				-->
				<p
					class="mb-2 mt-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
				>
					{isRun(training) ? 'Cross-train instead' : 'Or go back to running'}
				</p>
				<div class="grid grid-cols-2 gap-1.5">
					{#each ACTIVITIES as activity (activity.label)}
						{@const active = (training.cross_type ?? null) === activity.crossType}
						<button
							type="button"
							disabled={store.pending === 'session' || active}
							onclick={() => commitAndClose(() => store.crossTrain(activity.crossType))}
							aria-pressed={active}
							class="rounded-lg border px-2 py-3 text-xs transition-colors disabled:opacity-60 {active
								? 'border-primary bg-primary/10 text-foreground'
								: 'border-border bg-muted text-muted-foreground hover:text-foreground'}"
						>
							{activity.label}
						</button>
					{/each}
				</div>
				<p class="mt-2 text-[11px] leading-relaxed text-muted-foreground">
					A ride has a duration, no distance and no pace, so the terrain and shoe go with it —
					picking Run puts them back. Trenara also offers {UNMAPPED_ACTIVITIES.join(', ')}, which
					are missing here until we know what to send for each.
				</p>
			{/if}

			{#if store.pending === 'session'}
				<p class="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
					<Loader2 class="h-3 w-3 animate-spin" /> Saving…
				</p>
			{/if}
		{/if}
	</div>
</dialog>

<style>
	dialog {
		max-height: 100dvh;
	}
</style>
