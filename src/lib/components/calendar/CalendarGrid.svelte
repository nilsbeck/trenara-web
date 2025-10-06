<script lang="ts">
  import type { CalendarState, TrainingFilter } from './types';
  import CalendarCell from './CalendarCell.svelte';
  import { getContext } from 'svelte';
  import type { CalendarStore } from '$lib/types/index.js';
  
  // Props for backward compatibility
  let { 
    calendarState, 
    currentDate, 
    onDayClick, 
    hasTrainingEntriesForDate, 
    getTrainingStatusForDate 
  } = $props<{
    calendarState?: CalendarState;
    currentDate?: Date;
    onDayClick?: (day: number) => void;
    hasTrainingEntriesForDate?: (filter: TrainingFilter) => boolean;
    getTrainingStatusForDate?: (filter: TrainingFilter) => 'none' | 'scheduled' | 'completed' | 'missed';
  }>();

  // Try to get store from context, fallback to props
  const store = getContext<CalendarStore>('calendar');
  
  // Subscribe to store state
  let storeState = $state();
  
  $effect(() => {
    if (store) {
      const unsubscribe = store.subscribe((state) => {
        storeState = state;
      });
      
      return unsubscribe;
    }
  });
  
  // Use store if available, otherwise use props
  const state = $derived(calendarState || (storeState ? {
    selectedDate: storeState.selectedDate,
    currentDate: storeState.currentDate,
    daysInMonthWithOffset: storeState.monthData?.daysInMonthWithOffset || [],
    firstDayOfMonth: storeState.monthData?.firstDayOfMonth || 0,
    offsetAtEnd: storeState.monthData?.offsetAtEnd || 0,
    offsetAtStart: storeState.monthData?.offsetAtStart || 0
  } : null));
  
  const date = $derived(currentDate || storeState?.currentDate);
  const dayClickHandler = onDayClick || ((day: number) => {
    if (store && storeState) {
      const actualDay = day - storeState.monthData.offsetAtStart;
      store.setSelectedDate({
        year: storeState.currentDate.getFullYear(),
        month: storeState.currentDate.getMonth(),
        day: actualDay
      });
    }
  });
  
  const hasTrainingHandler = hasTrainingEntriesForDate || storeState?.hasTrainingEntriesForDate;
  const getStatusHandler = getTrainingStatusForDate || storeState?.getTrainingStatusForDate;
</script>

{#if state && date && hasTrainingHandler && getStatusHandler}
  <div class="grid grid-cols-7 gap-4 mt-4">
    {#each ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as day}
      <div class="text-center text-sm font-medium text-gray-800 dark:text-gray-100">
        {day}
      </div>
    {/each}
  </div>

  <div class="grid grid-cols-7 gap-0 mt-4">
    {#each state.daysInMonthWithOffset as day}
      <CalendarCell
        calendarState={state}
        currentDate={date}
        {day}
        onDayClick={dayClickHandler}
        hasTrainingEntriesForDate={hasTrainingHandler}
        getTrainingStatusForDate={getStatusHandler}
      />
    {/each}
  </div>
{:else}
  <div class="text-center text-gray-500 p-4">
    Calendar not available
  </div>
{/if} 
