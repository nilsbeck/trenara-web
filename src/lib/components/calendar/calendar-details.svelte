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
	let lastNutritionDate: string | null = null;
	let nutritionAbort: AbortController | null = null;

	async function loadNutrition(timestamp: string) {
		if (timestamp === lastNutritionDate) return; // already loaded for this date
		lastNutritionDate = timestamp;

		// Abort any in-flight request before starting a new one
		nutritionAbort?.abort();
		const controller = new AbortController();
		nutritionAbort = controller;

		nutritionLoading = true;
		try {
			const res = await fetch(`/api/v1/nutrition?timestamp=${encodeURIComponent(timestamp)}`, {
				signal: controller.signal
			});
			if (!res.ok) throw new Error(`${res.status}`);
			nutritionData = await res.json();
		} catch (e) {
			// Ignore aborted requests — a newer one is already in flight
			if (e instanceof DOMException && e.name === 'AbortError') return;
			nutritionData = null;
		} finally {
			// Only clear loading if this is still the active request
			if (nutritionAbort === controller) {
				nutritionLoading = false;
			}
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
		lastNutritionDate = null;
		nutritionData = null;

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

	// Fetch nutrition data when the Nutrition tab becomes active (browser-only)
	$effect(() => {
		if (browser && activeTab === Tab.Nutrition && store.selectedDateString) {
			loadNutrition(store.selectedDateString);
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
					onScheduleChanged={() => store.refresh()}
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
					isLoading={nutritionLoading || store.isLoading}
				/>
			{/if}
		</div>
	</div>
{/if}
