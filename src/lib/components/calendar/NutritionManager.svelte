<script lang="ts">
  import { getContext } from 'svelte';
  import type { CalendarStore } from '$lib/types/index.js';
  import type { NutritionAdvice } from '$lib/server/api/types';
  import { writable } from 'svelte/store';
  
  // Get store from context
  const store = getContext<CalendarStore>('calendar');
  
  if (!store) {
    throw new Error('NutritionManager must be used within a CalendarProvider');
  }

  // Props for passing data back to parent
  let { 
    onNutritionData,
    onNutritionLoading 
  } = $props<{
    onNutritionData: (data: NutritionAdvice | null, date: string | null) => void;
    onNutritionLoading: (loading: boolean) => void;
  }>();

  // Simple loading state
  const isLoading = writable(false);
  
  // Reactive loading state
  $effect(() => {
    let loading: boolean;
    isLoading.subscribe(value => loading = value)();
    onNutritionLoading(loading!);
  });

  // Load nutrition data function
  async function loadNutritionData() {
    const selectedDate = store.selectedDateString;
    if (!selectedDate) return;
    
    isLoading.set(true);
    try {
      const response = await fetch(`/api/v0/nutrition?timestamp=${selectedDate}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch nutrition data: ${response.statusText}`);
      }
      const data = await response.json();
      onNutritionData(data, store.selectedDateString);
    } catch (error) {
      console.error('Failed to fetch nutrition data:', error);
      onNutritionData(null, null);
    } finally {
      isLoading.set(false);
    }
  }

  // Load nutrition data when selected date changes
  let lastSelectedDate: string | null = null;
  $effect(() => {
    const currentSelectedDate = store.selectedDateString;
    if (currentSelectedDate && currentSelectedDate !== lastSelectedDate) {
      lastSelectedDate = currentSelectedDate;
      loadNutritionData();
    }
  });

  // Expose load function for manual loading
  export function loadNutrition() {
    loadNutritionData();
  }

  export function resetNutrition() {
    isLoading.set(false);
    onNutritionData(null, null);
  }
</script>

<!-- This component is purely functional, no template needed -->
