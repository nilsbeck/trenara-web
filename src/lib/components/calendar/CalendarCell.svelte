<script lang="ts">
  import type { CalendarState, TrainingFilter } from './types';
  
  let { calendarState, currentDate, day, onDayClick, hasTrainingEntriesForDate } = $props<{
    calendarState: CalendarState;
    currentDate: Date;
    day: number;
    onDayClick: (day: number) => void;
    hasTrainingEntriesForDate: (filter: TrainingFilter) => boolean;
  }>();

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
          <span class="dot run-dot"></span>
        {/if}
        {#if hasTrainingEntriesForDate({ type: 'strength', day: actualDay })}
          <span class="dot strength-dot"></span>
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
  
  .run-dot {
    background-color: rgb(59 130 246);
  }
  
  .strength-dot {
    background-color: rgb(239 68 68);
  }

  .selected {
    background-color: var(--color-secondary);
  }
  .today {
    background-color: rgba(234, 234, 234, 0.72);
  }
</style> 
