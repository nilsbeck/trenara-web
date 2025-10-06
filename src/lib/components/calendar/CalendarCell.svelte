<script lang="ts">
  import type { CalendarState, TrainingFilter } from './types';
  import { getContext } from 'svelte';
  import type { CalendarStore } from '$lib/types/index.js';
  
  let { calendarState, currentDate, day, onDayClick, hasTrainingEntriesForDate, getTrainingStatusForDate } = $props<{
    calendarState: CalendarState;
    currentDate: Date;
    day: number;
    onDayClick: (day: number) => void;
    hasTrainingEntriesForDate: (filter: TrainingFilter) => boolean;
    getTrainingStatusForDate: (filter: TrainingFilter) => 'none' | 'scheduled' | 'completed' | 'missed';
  }>();

  // Try to get store from context for enhanced functionality
  const store = getContext<CalendarStore>('calendar');

  let actualDay = $derived(day - calendarState.offsetAtStart);

  let isSelected = $derived(calendarState.selectedDate?.day === actualDay &&
    calendarState.selectedDate?.month === currentDate.getMonth() &&
    calendarState.selectedDate?.year === currentDate.getFullYear());
  let isToday = $derived(currentDate.getDate() === actualDay &&
    currentDate.getMonth() === new Date().getMonth() &&
    currentDate.getFullYear() === new Date().getFullYear() &&
    !isSelected);
</script>

<button
  type="button"
  aria-label={`Select day ${actualDay}`}
  class="px-2 py-2 cursor-pointer flex w-full justify-center text-gray-800 dark:text-gray-100"
  class:selected={isSelected}
  class:today={isToday}
  onclick={() => actualDay > 0 && onDayClick(day)}
  onkeydown={(e) => {
    if ((e.key === 'Enter' || e.key === ' ') && actualDay > 0) {
      onDayClick(day);
    }
  }}
>
  {#if actualDay > 0}
    <div class="flex flex-col items-center">
      <p class="text-base text-gray-500 dark:text-gray-100">
        {actualDay}
      </p>
      <div class="flex flex-row items-center">
        {#if hasTrainingEntriesForDate({ type: 'run', day: actualDay })}
          {@const runStatus = getTrainingStatusForDate({ type: 'run', day: actualDay })}
          <span class="dot run-dot" class:completed={runStatus === 'completed'} class:missed={runStatus === 'missed'}></span>
        {/if}
        {#if hasTrainingEntriesForDate({ type: 'strength', day: actualDay })}
          {@const strengthStatus = getTrainingStatusForDate({ type: 'strength', day: actualDay })}
          <span class="dot strength-dot" class:completed={strengthStatus === 'completed'} class:missed={strengthStatus === 'missed'}></span>
        {/if}
      </div>
    </div>
  {/if}
</button>

<style>
  .dot {
    height: 4px;
    width: 4px;
    margin: 0 2px;
    border-radius: 50%;
    background-color: rgb(156 163 175);
  }
  
  /* Default colors for scheduled/future trainings (blue) */
  .run-dot {
    background-color: rgb(59 130 246); /* Blue for scheduled/future runs */
  }
  
  .strength-dot {
    background-color: rgb(59 130 246); /* Blue for scheduled/future strength */
  }
  
  /* Green for completed trainings */
  .dot.completed {
    background-color: rgb(34 197 94); /* Green for completed */
  }
  
  /* Red for missed trainings */
  .dot.missed {
    background-color: rgb(239 68 68); /* Red for missed */
  }

  .selected {
    background-color: var(--color-secondary);
  }
  .today {
    background-color: rgba(234, 234, 234, 0.72);
  }
</style> 
