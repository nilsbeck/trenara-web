<script lang="ts">
  import { getContext } from 'svelte';
  import type { CalendarStore } from '$lib/types/index.js';
  import CalendarCell from './CalendarCell.svelte';
  
  // Get store from context
  const store = getContext<CalendarStore>('calendar');
  
  if (!store) {
    throw new Error('CalendarGridWithContext must be used within a CalendarProvider');
  }

  // Subscribe to store state
  let storeState = $state();
  
  $effect(() => {
    const unsubscribe = store.subscribe((state) => {
      storeState = state;
    });
    
    return unsubscribe;
  });

  // Props for custom day click handling
  let { onDayClick } = $props<{
    onDayClick?: (day: number) => void;
  }>();

  // Default day click handler
  const defaultDayClickHandler = (day: number) => {
    if (storeState) {
      const actualDay = day - storeState.monthData.offsetAtStart;
      store.setSelectedDate({
        year: storeState.currentDate.getFullYear(),
        month: storeState.currentDate.getMonth(),
        day: actualDay
      });
    }
  };

  const dayClickHandler = onDayClick || defaultDayClickHandler;
</script>

{#if storeState}
  <div class="grid grid-cols-7 gap-4 mt-4">
    {#each ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as day}
      <div class="text-center text-sm font-medium text-gray-800 dark:text-gray-100">
        {day}
      </div>
    {/each}
  </div>

  <div class="grid grid-cols-7 gap-0 mt-4">
    {#each storeState.monthData.daysInMonthWithOffset as day}
      <CalendarCell
        calendarState={{
          selectedDate: storeState.selectedDate,
          currentDate: storeState.currentDate,
          daysInMonthWithOffset: storeState.monthData.daysInMonthWithOffset,
          firstDayOfMonth: storeState.monthData.firstDayOfMonth,
          offsetAtEnd: storeState.monthData.offsetAtEnd,
          offsetAtStart: storeState.monthData.offsetAtStart
        }}
        currentDate={storeState.currentDate}
        {day}
        onDayClick={dayClickHandler}
        hasTrainingEntriesForDate={storeState.hasTrainingEntriesForDate}
        getTrainingStatusForDate={storeState.getTrainingStatusForDate}
      />
    {/each}
  </div>
{:else}
  <div class="text-center text-gray-500 p-4">
    Loading calendar...
  </div>
{/if}
