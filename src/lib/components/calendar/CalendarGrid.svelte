<script lang="ts">
  import type { CalendarState, TrainingFilter } from './types';
  import CalendarCell from './CalendarCell.svelte';
  
  export let calendarState: CalendarState;
  export let currentDate: Date;
  export let onDayClick: (day: number) => void;
  export let hasTrainingEntriesForDate: (filter: TrainingFilter) => boolean;
</script>

<div class="grid grid-cols-7 gap-4 mt-4">
  {#each ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as day}
    <div class="text-center text-sm font-medium text-gray-800 dark:text-gray-100">
      {day}
    </div>
  {/each}
</div>

<div class="grid grid-cols-7 gap-0 mt-4">
  {#each calendarState.daysInMonthWithOffset as day}
    <CalendarCell
      {calendarState}
      {currentDate}
      {day}
      {onDayClick}
      {hasTrainingEntriesForDate}
    />
  {/each}
</div> 
