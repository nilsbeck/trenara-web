<script lang="ts">
	import { getContext } from 'svelte';
	import { browser } from '$app/environment';
	import type { CalendarStore } from '$lib/stores/calendar.svelte';
	import { Tab } from '$lib/stores/calendar.svelte';
	import type { NutritionAdvice } from '$lib/server/trenara/types';
	import TrainingDetails from './training-details.svelte';
	import StrengthDetails from './strength-details.svelte';
	import NutritionDetails from './nutrition-details.svelte';

	const store = getContext<CalendarStore>('calendar');

	let activeTab = $state<Tab>(Tab.Training);

	// ── Nutrition data loading ─────────────────────────────────────
	let nutritionData = $state<NutritionAdvice | null>(null);
	let nutritionLoading = $state(false);
	let nutritionError = $state<string | null>(null);
	let nutritionAbort: AbortController | null = null;
	/**
	 * Which day's advice is in hand, and which version of the plan it was for.
	 * The advice is derived from the session, so a session that moved underneath
	 * us — overnight, or on a background refresh — invalidates it just as surely
	 * as picking a different day does.
	 */
	let lastNutritionKey: string | null = null;

	/*
		How long the tab waits before it gives up and says so.

		Nothing else between here and the Trenara API sets a deadline, so a request
		that never comes back left the tab on its "Loading..." for ever — the one
		state a user cannot do anything about, and cannot tell apart from a slow
		day. Past this the request is abandoned and the failure is shown, with a
		way to ask again.
	*/
	const NUTRITION_TIMEOUT_MS = 15_000;

	async function loadNutrition(timestamp: string, revision: number) {
		const key = `${revision}:${timestamp}`;
		if (key === lastNutritionKey) return; // already loaded for this date and plan
		lastNutritionKey = key;

		// Abort any in-flight request before starting a new one
		nutritionAbort?.abort();
		const controller = new AbortController();
		nutritionAbort = controller;

		nutritionLoading = true;
		nutritionError = null;

		let timedOut = false;
		const deadline = setTimeout(() => {
			timedOut = true;
			controller.abort();
		}, NUTRITION_TIMEOUT_MS);

		try {
			const res = await fetch(`/api/v1/nutrition?timestamp=${encodeURIComponent(timestamp)}`, {
				signal: controller.signal
			});
			if (!res.ok) throw new Error(`${res.status}`);
			nutritionData = await res.json();
		} catch (e) {
			const aborted = e instanceof DOMException && e.name === 'AbortError';
			// A newer request is already in flight and owns the state from here.
			if (aborted && !timedOut) return;

			nutritionData = null;
			nutritionError = timedOut
				? 'Nutrition took too long to load.'
				: 'Could not load nutrition for this day.';
			// A failed date is not a loaded date. Without this the guard above
			// treats the failure as the answer, and every later visit to the tab
			// returns the same blank — with no way to ask again.
			lastNutritionKey = null;
		} finally {
			clearTimeout(deadline);
			// Only clear loading if this is still the active request
			if (nutritionAbort === controller) {
				nutritionLoading = false;
			}
		}
	}

	function retryNutrition() {
		if (store.selectedDateString) {
			loadNutrition(store.selectedDateString, store.scheduleRevision);
		}
	}

	// ── Derived helpers ────────────────────────────────────────────
	const hasTraining = $derived(store.filteredTrainings.length > 0);
	const hasStrength = $derived(store.filteredStrengthTrainings.length > 0);

	// Show Nutrition tab whenever there's a training — nutrition data is fetched
	// lazily from the API (the nutritional_advice field on the training object is
	// always empty; actual data comes from /api/v1/nutrition).
	const hasNutrition = $derived(store.filteredTrainings.length > 0);

	const availableTabs = $derived.by(() => {
		const tabs: Tab[] = [];
		if (hasTraining) tabs.push(Tab.Training);
		if (hasStrength) tabs.push(Tab.Strength);
		if (hasNutrition) tabs.push(Tab.Nutrition);
		return tabs;
	});

	// Auto-select tab when selected date changes
	$effect(() => {
		const _ = store.selectedDateString;
		// Reset nutrition cache so it re-fetches for the new date
		lastNutritionKey = null;
		nutritionData = null;
		nutritionError = null;

		if (hasTraining) {
			activeTab = Tab.Training;
		} else if (hasStrength) {
			activeTab = Tab.Strength;
		} else if (hasNutrition) {
			activeTab = Tab.Nutrition;
		} else {
			activeTab = Tab.Training;
		}
	});

	// Fetch nutrition data when the Nutrition tab becomes active (browser-only),
	// and again if the plan it is advice for has changed since.
	$effect(() => {
		const revision = store.scheduleRevision;
		if (browser && activeTab === Tab.Nutrition && store.selectedDateString) {
			loadNutrition(store.selectedDateString, revision);
		}
	});

	const TAB_LABELS: Record<Tab, string> = {
		[Tab.Training]: 'Training',
		[Tab.Strength]: 'Strength',
		[Tab.Nutrition]: 'Nutrition'
	};

	const selectedTraining = $derived(
		store.filteredTrainings.length > 0 ? store.filteredTrainings[0] : null
	);

	const selectedEntry = $derived(
		store.selectedRunEntries.length > 0 ? store.selectedRunEntries[0] : null
	);

	const selectedStrength = $derived(
		store.filteredStrengthTrainings.length > 0 ? store.filteredStrengthTrainings[0] : null
	);

	const nutritionDate = $derived.by(() => {
		return selectedTraining?.day_long ?? null;
	});
</script>

{#if store.selectedDate}
	<div class="rounded-xl bg-card shadow-lg border border-border overflow-hidden">
		{#if availableTabs.length > 0}
			<div class="flex border-b border-border">
				{#each availableTabs as tab}
					<button
						type="button"
						class="flex-1 px-4 py-2.5 text-sm font-medium transition-colors"
						class:text-foreground={activeTab === tab}
						class:border-b-2={activeTab === tab}
						class:border-primary={activeTab === tab}
						class:text-muted-foreground={activeTab !== tab}
						class:hover:text-foreground={activeTab !== tab}
						onclick={() => (activeTab = tab)}
					>
						{TAB_LABELS[tab]}
					</button>
				{/each}
			</div>
		{/if}

		<div class="p-4">
			{#if activeTab === Tab.Training}
				<TrainingDetails
					selectedDate={store.selectedDateString}
					training={selectedTraining}
					entry={selectedEntry}
					isLoading={store.isLoading}
					onScheduleChanged={() => {
						// refresh() re-runs the page load too, so the cards beside the
						// calendar move with it — no second invalidateAll needed.
						store.refresh();
					}}
					onTrainingChanged={(updated) => store.replaceTraining(updated)}
				/>
			{:else if activeTab === Tab.Strength}
				<StrengthDetails
					selectedDate={store.selectedDateString}
					strengthData={selectedStrength}
					isLoading={store.isLoading}
				/>
			{:else if activeTab === Tab.Nutrition}
				<NutritionDetails
					selectedDate={store.selectedDateString}
					{nutritionDate}
					{nutritionData}
					error={nutritionError}
					onRetry={retryNutrition}
					isLoading={nutritionLoading || store.isLoading}
				/>
			{/if}
		</div>
	</div>
{/if}
