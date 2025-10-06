/**
 * Calendar store using traditional Svelte stores
 */

import { writable, derived, get } from 'svelte/store';
import type { 
  CalendarStore, 
  CalendarDate, 
  TrainingFilter, 
  TrainingStatus 
} from '$lib/types/index.js';
import type { Schedule, ScheduledTraining, StrengthTraining, Entry } from '$lib/server/api/types.js';
import { api } from '$lib/utils/api-client.js';

/**
 * Create a calendar store instance using traditional Svelte stores
 */
export function createCalendarStore(initialDate: Date): CalendarStore {
  // Core state stores
  const currentDate = writable(initialDate);
  const selectedDate = writable<CalendarDate | null>(null);
  const schedule = writable<Schedule | null>(null);
  const isLoading = writable(false);
  const error = writable<Error | null>(null);

  // Derived stores
  const selectedDateString = derived(selectedDate, ($selectedDate) => 
    $selectedDate
      ? `${$selectedDate.year}-${String($selectedDate.month + 1).padStart(2, '0')}-${String($selectedDate.day).padStart(2, '0')}`
      : null
  );

  const filteredTrainings = derived([schedule, selectedDateString], ([$schedule, $selectedDateString]) => 
    $schedule?.trainings?.filter((training: ScheduledTraining) => 
      training.day_long === $selectedDateString
    ) ?? []
  );

  const filteredStrengthTrainings = derived([schedule, selectedDateString], ([$schedule, $selectedDateString]) => 
    $schedule?.strength_trainings?.filter((training: StrengthTraining) => 
      training.day === $selectedDateString
    ) ?? []
  );

  const monthData = derived(currentDate, ($currentDate) => {
    const year = $currentDate.getFullYear();
    const month = $currentDate.getMonth();
    
    const firstDayOfMonth = new Date(year, month, 1).getDay();
    const isSunday = firstDayOfMonth === 0;
    const offsetAtStart = isSunday ? firstDayOfMonth + 6 : firstDayOfMonth - 1;
    
    let daysInCurrentMonthWithOffset = new Date(year, month + 1, 0).getDate() + firstDayOfMonth - 1;
    if (isSunday) {
      daysInCurrentMonthWithOffset += 7;
    }
    const offsetAtEnd = daysInCurrentMonthWithOffset % 7;
    
    const daysInMonthWithOffset = Array.from(
      { length: daysInCurrentMonthWithOffset },
      (_, i) => i + 1
    );

    return {
      daysInMonthWithOffset,
      firstDayOfMonth,
      offsetAtStart,
      offsetAtEnd
    };
  });

  // Actions
  const setCurrentDate = (date: Date) => {
    currentDate.set(date);
  };

  const setSelectedDate = (date: CalendarDate | null) => {
    selectedDate.set(date);
  };

  const setSchedule = (newSchedule: Schedule) => {
    schedule.set(newSchedule);
  };

  const loadMonthData = async (date: Date) => {
    isLoading.set(true);
    error.set(null);
    
    try {
      // Update current date if different
      currentDate.set(date);
      
      const response = await api.getMonthSchedule(date);
      
      if (response.success && response.data) {
        schedule.set(response.data);
      } else {
        // Set empty schedule structure if no data
        schedule.set({
          id: 0,
          start_day: 0,
          start_day_long: '',
          training_week: 0,
          type: 'other',
          trainings: [],
          strength_trainings: [],
          entries: []
        });
      }
    } catch (err) {
      const errorObj = err instanceof Error ? err : new Error('Failed to load month data');
      error.set(errorObj);
      
      // Set empty schedule on error for graceful degradation
      schedule.set({
        id: 0,
        start_day: 0,
        start_day_long: '',
        training_week: 0,
        type: 'other',
        trainings: [],
        strength_trainings: [],
        entries: []
      });
      throw err;
    } finally {
      isLoading.set(false);
    }
  };

  const refreshData = async () => {
    let currentDateValue: Date;
    currentDate.subscribe(value => currentDateValue = value)();
    await loadMonthData(currentDateValue!);
  };

  const invalidateCache = (date?: Date) => {
    // Cache invalidation would be implemented here
    // For now, just trigger a refresh
    if (date) {
      loadMonthData(date);
    } else {
      refreshData();
    }
  };

  // Navigation methods
  const goToPreviousMonth = async () => {
    let currentDateValue: Date;
    currentDate.subscribe(value => currentDateValue = value)();
    
    const newDate = new Date(currentDateValue!);
    newDate.setMonth(newDate.getMonth() - 1);
    console.log('Going to previous month:', newDate.toISOString().split('T')[0]);
    selectedDate.set(null);
    await loadMonthData(newDate);
  };

  const goToNextMonth = async () => {
    let currentDateValue: Date;
    currentDate.subscribe(value => currentDateValue = value)();
    
    const newDate = new Date(currentDateValue!);
    newDate.setMonth(newDate.getMonth() + 1);
    console.log('Going to next month:', newDate.toISOString().split('T')[0]);
    selectedDate.set(null);
    await loadMonthData(newDate);
  };

  const goToToday = async () => {
    const today = new Date();
    selectedDate.set({
      year: today.getFullYear(),
      month: today.getMonth(),
      day: today.getDate()
    });
    await loadMonthData(today);
  };

  const refresh = async () => {
    await refreshData();
  };

  const navigation = {
    goToPreviousMonth,
    goToNextMonth,
    goToToday,
    refresh
  };

  // Training methods factory - creates methods with access to current state
  const createTrainingMethods = (scheduleValue: Schedule | null, currentDateValue: Date) => {
    const getTrainingStatusForDate = (filter: TrainingFilter): TrainingStatus => {
      if (!scheduleValue || (!scheduleValue.trainings?.length && !scheduleValue.strength_trainings?.length && !scheduleValue.entries?.length)) {
        return 'none';
      }
      
      const year = currentDateValue.getFullYear();
      const month = currentDateValue.getMonth();
      const calendarDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(filter.day).padStart(2, '0')}`;

      // Check if this date is in the past, today, or future
      const today = new Date();
      const targetDate = new Date(year, month, filter.day);
      const isToday = targetDate.toDateString() === today.toDateString();
      const isPast = targetDate < today && !isToday;

      if (filter.type === 'strength') {
        // Check for scheduled strength trainings
        const hasScheduledStrength = scheduleValue.strength_trainings?.some((entry: StrengthTraining) => {
          const entryDate = new Date(entry.day).toISOString().split('T')[0];
          return entryDate === calendarDate;
        });

        // Check for completed strength entries
        const hasCompletedStrength = scheduleValue.entries?.some((entry: Entry) => {
          const entryDate = new Date(entry.start_time).toISOString().split('T')[0];
          return entryDate === calendarDate && entry.type === 'strength';
        });

        if (hasCompletedStrength) {
          return 'completed';
        } else if (hasScheduledStrength) {
          return isPast ? 'missed' : 'scheduled';
        }
        return 'none';
      }

      // For 'run' type, check scheduled trainings
      const hasScheduledRun = scheduleValue.trainings?.some((entry: ScheduledTraining) => {
        const entryDate = new Date(entry.day_long).toISOString().split('T')[0];
        return entryDate === calendarDate;
      });

      // Check for completed run entries
      const hasCompletedRun = scheduleValue.entries?.some((entry: Entry) => {
        const entryDate = new Date(entry.start_time).toISOString().split('T')[0];
        return entryDate === calendarDate && entry.type === 'run';
      });

      if (hasCompletedRun) {
        return 'completed';
      } else if (hasScheduledRun) {
        return isPast ? 'missed' : 'scheduled';
      }
      return 'none';
    };

    const hasTrainingEntriesForDate = (filter: TrainingFilter): boolean => {
      return getTrainingStatusForDate(filter) !== 'none';
    };

    return { getTrainingStatusForDate, hasTrainingEntriesForDate };
  };

  // Create the derived store
  const derivedStore = derived(
    [currentDate, selectedDate, isLoading, schedule, error, selectedDateString, filteredTrainings, filteredStrengthTrainings, monthData],
    ([$currentDate, $selectedDate, $isLoading, $schedule, $error, $selectedDateString, $filteredTrainings, $filteredStrengthTrainings, $monthData]) => {
      const trainingMethods = createTrainingMethods($schedule, $currentDate);
      return {
        currentDate: $currentDate,
        selectedDate: $selectedDate,
        isLoading: $isLoading,
        schedule: $schedule,
        error: $error,
        selectedDateString: $selectedDateString,
        filteredTrainings: $filteredTrainings,
        filteredStrengthTrainings: $filteredStrengthTrainings,
        monthData: $monthData,
        navigation,
        getTrainingStatusForDate: trainingMethods.getTrainingStatusForDate,
        hasTrainingEntriesForDate: trainingMethods.hasTrainingEntriesForDate
      };
    }
  );

  // Store interface implementation
  return {
    // Store subscriptions
    subscribe: derivedStore.subscribe,
    
    // Direct property access for compatibility
    get currentDate() { 
      return get(derivedStore).currentDate;
    },
    get selectedDate() { 
      return get(derivedStore).selectedDate;
    },
    get isLoading() { 
      return get(derivedStore).isLoading;
    },
    get schedule() { 
      return get(derivedStore).schedule;
    },
    get error() { 
      return get(derivedStore).error;
    },
    get selectedDateString() { 
      return get(derivedStore).selectedDateString;
    },
    get filteredTrainings() { 
      return get(derivedStore).filteredTrainings;
    },
    get filteredStrengthTrainings() { 
      return get(derivedStore).filteredStrengthTrainings;
    },
    get monthData() { 
      return get(derivedStore).monthData;
    },
    
    // Actions
    setCurrentDate,
    setSelectedDate,
    setSchedule,
    loadMonthData,
    refreshData,
    invalidateCache,
    
    // Navigation
    navigation,
    
    // Training methods
    getTrainingStatusForDate: (filter: TrainingFilter) => {
      return get(derivedStore).getTrainingStatusForDate(filter);
    },
    hasTrainingEntriesForDate: (filter: TrainingFilter) => {
      return get(derivedStore).hasTrainingEntriesForDate(filter);
    }
  };
}
