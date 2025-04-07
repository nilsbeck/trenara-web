import type { CalendarState, TrainingFilter } from './types';
import type { SvelteComponent } from 'svelte';

declare module './CalendarCell.svelte' {
  export default class CalendarCell extends SvelteComponent {
    $$prop_def: {
      calendarState: CalendarState;
      currentDate: Date;
      day: number;
      onDayClick: (day: number) => void;
      hasTrainingEntriesForDate: (filter: TrainingFilter) => boolean;
    };
    $$events_def: {};
    $$slot_def: {};
  }
} 
