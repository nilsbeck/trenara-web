/**
 * Enhanced TypeScript interfaces for the refactored calendar component
 * Provides comprehensive type safety and validation for all calendar data structures
 */

import type { 
  Schedule, 
  ScheduledTraining, 
  StrengthTraining, 
  Entry, 
  NutritionAdvice 
} from '$lib/server/api/types';
import type { ServiceError } from '../services/calendarService';

// Re-export existing types for convenience
export type { Schedule, ScheduledTraining, StrengthTraining, Entry, NutritionAdvice };

/**
 * Calendar date representation
 */
export interface CalendarDate {
  year: number;
  month: number; // 0-based (0 = January)
  day: number;   // 1-based day of month
}

/**
 * Calendar grid data for rendering the monthly view
 */
export interface CalendarGridData {
  daysInMonthWithOffset: number[];
  firstDayOfMonth: number;
  offsetAtStart: number;
  offsetAtEnd: number;
}

/**
 * Loading states for different calendar operations
 */
export interface LoadingStates {
  monthData: boolean;
  nutrition: boolean;
  trainingActions: boolean;
  dateChange: boolean;
  feedback: boolean;
}

/**
 * Error states for different calendar operations
 */
export interface ErrorStates {
  monthData: ServiceError | null;
  nutrition: ServiceError | null;
  trainingActions: ServiceError | null;
  dateChange: ServiceError | null;
  feedback: ServiceError | null;
}

/**
 * Complete calendar state interface
 */
export interface CalendarState {
  // Date state
  currentDate: Date;
  selectedDate: CalendarDate | null;
  
  // Grid calculation (derived)
  gridData: CalendarGridData;
  
  // Data state
  schedule: Schedule | null;
  nutritionData: Map<string, NutritionAdvice>;
  
  // UI state
  selectedTab: Tab;
  loadingStates: LoadingStates;
  errorStates: ErrorStates;
}

/**
 * Tab enumeration for calendar details
 */
export enum Tab {
  Training = 'training',
  Strength = 'strength',
  Nutrition = 'nutrition'
}

/**
 * Training filter for calendar grid
 */
export interface TrainingFilter {
  type: 'run' | 'strength' | 'all';
  day: number;
}

/**
 * Calendar event representation
 */
export interface CalendarEvent {
  date: Date;
  type: 'training' | 'strength' | 'entry';
  data: ScheduledTraining | StrengthTraining | Entry;
  id: number;
}

/**
 * Tab configuration for TabManager component
 */
export interface TabConfig {
  id: Tab;
  label: string;
  visible: boolean;
  ariaLabel: string;
  icon?: string;
}

/**
 * Calendar navigation actions
 */
export interface CalendarNavigation {
  goToPreviousMonth: () => void;
  goToNextMonth: () => void;
  refresh: () => void;
  goToToday: () => void;
}

/**
 * Calendar actions for training operations
 */
export interface CalendarActions {
  deleteTraining: (trainingId: number) => Promise<void>;
  changeDateTraining: (trainingId: number, newDate: Date) => Promise<void>;
  submitFeedback: (entryId: number, rating: number) => Promise<void>;
}

/**
 * Props for the main Calendar component
 */
export interface CalendarProps {
  today: Date;
  schedule: Schedule;
  onScheduleUpdate?: (schedule: Schedule) => void;
  onError?: (error: ServiceError) => void;
}

/**
 * Props for CalendarHeader component
 */
export interface CalendarHeaderProps {
  currentDate: Date;
  navigation: CalendarNavigation;
  isLoading?: boolean;
}

/**
 * Props for CalendarGrid component
 */
export interface CalendarGridProps {
  gridData: CalendarGridData;
  currentDate: Date;
  selectedDate: CalendarDate | null;
  onDayClick: (day: number) => void;
  hasTrainingForDay: (day: number) => boolean;
  isLoading?: boolean;
}

/**
 * Props for CalendarDetails component
 */
export interface CalendarDetailsProps {
  selectedDate: CalendarDate | null;
  selectedTab: Tab;
  onTabChange: (tab: Tab) => void;
  trainingData: ScheduledTraining[];
  strengthData: StrengthTraining[];
  entryData: Entry[];
  nutritionData: NutritionAdvice | null;
  loadingStates: LoadingStates;
  errorStates: ErrorStates;
  actions: CalendarActions;
}

/**
 * Props for TabManager component
 */
export interface TabManagerProps {
  tabs: TabConfig[];
  selectedTab: Tab;
  onTabChange: (tab: Tab) => void;
  disabled?: boolean;
}

/**
 * Props for TrainingDetails component
 */
export interface TrainingDetailsProps {
  selectedDate: string | null;
  trainingData: ScheduledTraining[];
  entryData: Entry[];
  actions: CalendarActions;
  isLoading?: boolean;
  error?: ServiceError | null;
}

/**
 * Props for StrengthDetails component
 */
export interface StrengthDetailsProps {
  selectedDate: string | null;
  strengthData: StrengthTraining[];
  actions: CalendarActions;
  isLoading?: boolean;
  error?: ServiceError | null;
}

/**
 * Props for NutritionDetails component
 */
export interface NutritionDetailsProps {
  selectedDate: string | null;
  nutritionData: NutritionAdvice | null;
  isLoading?: boolean;
  error?: ServiceError | null;
}

/**
 * Props for CalendarErrorBoundary component
 */
export interface CalendarErrorBoundaryProps {
  children: any;
  fallback?: (error: Error, retry: () => void) => any;
  onError?: (error: Error) => void;
}

/**
 * Error boundary state
 */
export interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: any;
}

/**
 * Loading indicator props
 */
export interface LoadingIndicatorProps {
  size?: 'small' | 'medium' | 'large';
  message?: string;
  overlay?: boolean;
}

/**
 * Calendar store interface for Svelte 5 runes
 */
export interface CalendarStore {
  // State
  currentDate: Date;
  selectedDate: CalendarDate | null;
  schedule: Schedule | null;
  nutritionData: Map<string, NutritionAdvice>;
  selectedTab: Tab;
  loadingStates: LoadingStates;
  errorStates: ErrorStates;
  
  // Derived state
  selectedDateString: string | null;
  filteredTrainings: ScheduledTraining[];
  filteredStrengthTrainings: StrengthTraining[];
  filteredEntries: Entry[];
  calendarGrid: CalendarGridData;
  
  // Actions
  setCurrentDate: (date: Date) => void;
  setSelectedDate: (date: CalendarDate | null) => void;
  setSchedule: (schedule: Schedule) => void;
  setNutritionData: (dateString: string, data: NutritionAdvice) => void;
  setSelectedTab: (tab: Tab) => void;
  setLoading: (key: keyof LoadingStates, loading: boolean) => void;
  setError: (key: keyof ErrorStates, error: ServiceError | null) => void;
  clearErrors: () => void;
}

/**
 * Type guards for runtime validation
 */

export function isValidCalendarDate(date: unknown): date is CalendarDate {
  return (
    typeof date === 'object' &&
    date !== null &&
    'year' in date &&
    'month' in date &&
    'day' in date &&
    typeof (date as CalendarDate).year === 'number' &&
    typeof (date as CalendarDate).month === 'number' &&
    typeof (date as CalendarDate).day === 'number' &&
    (date as CalendarDate).year > 1900 &&
    (date as CalendarDate).year < 3000 &&
    (date as CalendarDate).month >= 0 &&
    (date as CalendarDate).month <= 11 &&
    (date as CalendarDate).day >= 1 &&
    (date as CalendarDate).day <= 31
  );
}

export function isValidTrainingFilter(filter: unknown): filter is TrainingFilter {
  return (
    typeof filter === 'object' &&
    filter !== null &&
    'type' in filter &&
    'day' in filter &&
    ['run', 'strength', 'all'].includes((filter as TrainingFilter).type) &&
    typeof (filter as TrainingFilter).day === 'number' &&
    (filter as TrainingFilter).day >= 1 &&
    (filter as TrainingFilter).day <= 31
  );
}

export function isValidTab(tab: unknown): tab is Tab {
  return typeof tab === 'string' && Object.values(Tab).includes(tab as Tab);
}

export function isValidLoadingStates(states: unknown): states is LoadingStates {
  return (
    typeof states === 'object' &&
    states !== null &&
    'monthData' in states &&
    'nutrition' in states &&
    'trainingActions' in states &&
    'dateChange' in states &&
    'feedback' in states &&
    typeof (states as LoadingStates).monthData === 'boolean' &&
    typeof (states as LoadingStates).nutrition === 'boolean' &&
    typeof (states as LoadingStates).trainingActions === 'boolean' &&
    typeof (states as LoadingStates).dateChange === 'boolean' &&
    typeof (states as LoadingStates).feedback === 'boolean'
  );
}

export function isServiceError(error: unknown): error is ServiceError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    'status' in error &&
    'code' in error &&
    'retryable' in error &&
    typeof (error as ServiceError).message === 'string' &&
    typeof (error as ServiceError).status === 'number' &&
    typeof (error as ServiceError).code === 'string' &&
    typeof (error as ServiceError).retryable === 'boolean'
  );
}

/**
 * Utility types for component composition
 */

export type CalendarComponent = 'header' | 'grid' | 'details' | 'navigation' | 'tabs';

export type CalendarEventHandler<T = void> = (event: CustomEvent<T>) => void;

export type CalendarSlotProps = {
  selectedDate: CalendarDate | null;
  currentDate: Date;
  isLoading: boolean;
  error: ServiceError | null;
};

/**
 * Constants for calendar configuration
 */

export const DEFAULT_LOADING_STATES: LoadingStates = {
  monthData: false,
  nutrition: false,
  trainingActions: false,
  dateChange: false,
  feedback: false
};

export const DEFAULT_ERROR_STATES: ErrorStates = {
  monthData: null,
  nutrition: null,
  trainingActions: null,
  dateChange: null,
  feedback: null
};

export const DEFAULT_TAB_CONFIGS: TabConfig[] = [
  {
    id: Tab.Training,
    label: 'Training',
    visible: true,
    ariaLabel: '🏃🏻‍♂️‍➡️ Training',
    icon: '🏃🏻‍♂️‍➡️'
  },
  {
    id: Tab.Strength,
    label: 'Strength',
    visible: true,
    ariaLabel: '💪 Strength',
    icon: '💪'
  },
  {
    id: Tab.Nutrition,
    label: 'Nutrition',
    visible: true,
    ariaLabel: '🥪 Nutrition',
    icon: '🥪'
  }
];

/**
 * Helper functions for type conversion
 */

export function calendarDateToString(date: CalendarDate): string {
  const year = date.year;
  const month = String(date.month + 1).padStart(2, '0');
  const day = String(date.day).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function stringToCalendarDate(dateString: string): CalendarDate | null {
  const match = dateString.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10) - 1; // Convert to 0-based
  const day = parseInt(match[3], 10);
  
  const date: CalendarDate = { year, month, day };
  return isValidCalendarDate(date) ? date : null;
}

export function dateToCalendarDate(date: Date): CalendarDate {
  return {
    year: date.getFullYear(),
    month: date.getMonth(),
    day: date.getDate()
  };
}

export function calendarDateToDate(calendarDate: CalendarDate): Date {
  return new Date(calendarDate.year, calendarDate.month, calendarDate.day);
}
