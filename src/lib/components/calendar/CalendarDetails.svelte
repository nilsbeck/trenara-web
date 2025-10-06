<script lang="ts">
  import { getContext } from 'svelte';
  import type { CalendarStore } from '$lib/types/index.js';
  import type { ScheduledTraining, StrengthTraining, Entry, NutritionAdvice } from '$lib/server/api/types';
  import { Tab } from './types';
  import TrainingDetails from './trainingDetails.svelte';
  import StrengthDetails from './strengthDetails.svelte';
  import NutritionDetails from './nutritionDetails.svelte';
  import NutritionManager from './NutritionManager.svelte';
  
  // Get store from context
  const store = getContext<CalendarStore>('calendar');
  
  if (!store) {
    throw new Error('CalendarDetails must be used within a CalendarProvider');
  }

  // Props
  let { 
    selectedTab = $bindable(Tab.Training),
    selectedTraining,
    selectedTrainingStrength,
    selectedRunTrainingEntry,
    selectedStrengthTrainingEntry
  } = $props<{
    selectedTab?: Tab;
    selectedTraining: ScheduledTraining[];
    selectedTrainingStrength: StrengthTraining[];
    selectedRunTrainingEntry: Entry[];
    selectedStrengthTrainingEntry: Entry[];
  }>();

  // Nutrition state
  let nutritionData: NutritionAdvice | null = $state(null);
  let nutritionDate: string | null = $state(null);
  let isNutritionLoading: boolean = $state(false);

  // Handle nutrition data updates
  function handleNutritionData(data: NutritionAdvice | null, date: string | null) {
    nutritionData = data;
    nutritionDate = date;
  }

  function handleNutritionLoading(loading: boolean) {
    isNutritionLoading = loading;
  }

  // Auto-select appropriate tab based on available data
  $effect(() => {
    const hasTraining = selectedTraining.length > 0 || selectedRunTrainingEntry.length > 0;
    const hasStrength = selectedTrainingStrength.length > 0;
    
    // If no training data, default to nutrition
    if (!hasTraining && !hasStrength) {
      selectedTab = Tab.Nutrition;
    } else if (hasTraining && selectedTab === Tab.Nutrition) {
      // If training data becomes available and we're on nutrition, switch to training
      selectedTab = Tab.Training;
    }
  });

  // Preload nutrition data when it will be the default tab
  $effect(() => {
    const hasTraining = selectedTraining.length > 0 || selectedRunTrainingEntry.length > 0;
    const hasStrength = selectedTrainingStrength.length > 0;
    const selectedDate = store.selectedDateString;
    
    if (selectedDate && !hasTraining && !hasStrength && nutritionDate !== selectedDate) {
      // Nutrition will be the default tab, preload immediately
      nutritionManager?.loadNutrition();
    }
  });

  let nutritionManager: NutritionManager;
</script>

<div class="tabs tabs-border dark:bg-gray-700 bg-gray-50 rounded-b-xl w-full">
  {#if selectedTraining.length > 0 || selectedRunTrainingEntry.length > 0}
    <input
      type="radio"
      name="details-tab"
      class="tab"
      value="training"
      bind:group={selectedTab}
      aria-label="🏃🏻‍♂️‍➡️ Training"
    />
    <div class="tab-content px-4" class:active={selectedTab === Tab.Training}>
      {#if store.schedule}
        <TrainingDetails
          schedule={store.schedule}
          {selectedTraining}
          {selectedRunTrainingEntry}
          selectedDay={store.selectedDate?.day ?? null}
          selectedMonth={store.selectedDate?.month ?? null}
          selectedYear={store.selectedDate?.year ?? null}
          selectedDate={store.selectedDateString}
        />
      {/if}
    </div>
  {/if}
  
  {#if selectedTrainingStrength.length > 0}
    <input
      type="radio"
      name="details-tab"
      class="tab"
      value="strength"
      bind:group={selectedTab}
      aria-label="💪 Strength"
    />
    <div class="tab-content px-6" class:active={selectedTab === Tab.Strength}>
      <StrengthDetails
        selectedDate={store.selectedDateString}
        strengthData={selectedTrainingStrength[0]}
        isStrengthLoading={store.isLoading}
      />
    </div>
  {/if}
  
  <input
    type="radio"
    name="details-tab"
    class="tab"
    value="nutrition"
    bind:group={selectedTab}
    aria-label="🥪 Nutrition"
  />
  <div class="tab-content px-6" class:active={selectedTab === Tab.Nutrition}>
    <NutritionDetails 
      selectedDate={store.selectedDateString} 
      {nutritionDate} 
      {nutritionData} 
      {isNutritionLoading} 
    />
  </div>
</div>

<!-- Nutrition Manager - handles data loading -->
<NutritionManager 
  bind:this={nutritionManager}
  onNutritionData={handleNutritionData}
  onNutritionLoading={handleNutritionLoading}
/>

<style>
  /* Prevent width changes during tab transitions */
  .tabs {
    width: 100%; /* Force consistent width */
    max-width: 28rem; /* Match max-w-md from parent */
  }

  .tab-content {
    width: 100%; /* Ensure content doesn't affect container width */
  }
</style>
