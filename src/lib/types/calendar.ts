/**
 * Calendar-related type definitions
 */

export interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

export interface CalendarState {
  currentDate: Date;
  selectedDate: CalendarDate | null;
  daysInMonthWithOffset: number[];
  firstDayOfMonth: number;
  offsetAtEnd: number;
  offsetAtStart: number;
}

export interface TrainingFilter {
  type: 'run' | 'strength';
  day: number;
}

export type TrainingStatus = 'none' | 'scheduled' | 'completed' | 'missed';

export interface TrainingStatusInfo {
  type: 'run' | 'strength';
  status: TrainingStatus;
  date: string;
}

export interface CalendarGridData {
  daysInMonthWithOffset: number[];
  firstDayOfMonth: number;
  offsetAtStart: number;
  offsetAtEnd: number;
}

export interface CalendarNavigation {
  goToPreviousMonth: () => Promise<void>;
  goToNextMonth: () => Promise<void>;
  goToToday: () => Promise<void>;
  refresh: () => Promise<void>;
}

export interface CalendarActions {
  setCurrentDate: (date: Date) => void;
  setSelectedDate: (date: CalendarDate | null) => void;
  setSchedule: (schedule: import('$lib/server/api/types').Schedule) => void;
  loadMonthData: (date: Date) => Promise<void>;
  refreshData: () => Promise<void>;
  invalidateCache: (date?: Date) => void;
}

export interface CalendarStore extends CalendarActions {
  // State
  readonly currentDate: Date;
  readonly selectedDate: CalendarDate | null;
  readonly isLoading: boolean;
  readonly schedule: import('$lib/server/api/types').Schedule | null;
  readonly error: Error | null;
  
  // Derived State
  readonly selectedDateString: string | null;
  readonly filteredTrainings: import('$lib/server/api/types').ScheduledTraining[];
  readonly filteredStrengthTrainings: import('$lib/server/api/types').StrengthTraining[];
  readonly monthData: CalendarGridData;
  
  // Navigation
  readonly navigation: CalendarNavigation;
  
  // Training methods
  getTrainingStatusForDate: (filter: TrainingFilter) => TrainingStatus;
  hasTrainingEntriesForDate: (filter: TrainingFilter) => boolean;
  
  // Store subscription
  subscribe(subscriber: import('./stores.js').StoreSubscriber<CalendarStore>): import('./stores.js').StoreUnsubscriber;
}

export interface CalendarProps {
  today: Date;
  schedule: import('$lib/server/api/types').Schedule;
  onScheduleUpdate?: (schedule: import('$lib/server/api/types').Schedule) => void;
}

export interface CalendarCellProps {
  calendarState: CalendarState;
  currentDate: Date;
  day: number;
  onDayClick: (day: number) => void;
  hasTrainingEntriesForDate: (filter: TrainingFilter) => boolean;
  getTrainingStatusForDate: (filter: TrainingFilter) => TrainingStatus;
}

export interface CalendarGridProps {
  calendarState: CalendarState;
  currentDate: Date;
  onDayClick: (day: number) => void;
  hasTrainingEntriesForDate: (filter: TrainingFilter) => boolean;
  getTrainingStatusForDate: (filter: TrainingFilter) => TrainingStatus;
}

export interface CalendarHeaderProps {
  currentDate: Date;
  navigation: CalendarNavigation;
  isLoading?: boolean;
}

export interface CalendarDetailsProps {
  selectedDate: CalendarDate | null;
  selectedTab: import('./ui').Tab;
  onTabChange: (tab: import('./ui').Tab) => void;
}
