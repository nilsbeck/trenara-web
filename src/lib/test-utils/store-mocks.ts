/**
 * Mock implementations for stores used in testing
 */

import { vi } from 'vitest';
import type { CalendarStore, ErrorStore, AuthStore } from '$lib/types/index.js';
import type { Schedule } from '$lib/server/api/types.js';

/**
 * Create a mock calendar store for testing
 */
export function createMockCalendarStore(overrides: Partial<CalendarStore> = {}): CalendarStore {
  const mockSchedule: Schedule = {
    id: 1,
    start_day: 1,
    start_day_long: '2024-01-01',
    training_week: 1,
    type: 'ultimate',
    trainings: [],
    strength_trainings: [],
    entries: []
  };

  const defaultStore: CalendarStore = {
    // State
    currentDate: new Date('2024-01-15'),
    selectedDate: { year: 2024, month: 0, day: 15 },
    isLoading: false,
    schedule: mockSchedule,
    error: null,
    
    // Derived state
    selectedDateString: '2024-01-15',
    filteredTrainings: [],
    filteredStrengthTrainings: [],
    monthData: {
      daysInMonthWithOffset: Array.from({ length: 31 }, (_, i) => i + 1),
      firstDayOfMonth: 1,
      offsetAtStart: 0,
      offsetAtEnd: 0
    },
    
    // Actions
    setCurrentDate: vi.fn(),
    setSelectedDate: vi.fn(),
    setSchedule: vi.fn(),
    loadMonthData: vi.fn().mockResolvedValue(undefined),
    refreshData: vi.fn().mockResolvedValue(undefined),
    invalidateCache: vi.fn(),
    
    // Navigation
    navigation: {
      goToPreviousMonth: vi.fn().mockResolvedValue(undefined),
      goToNextMonth: vi.fn().mockResolvedValue(undefined),
      goToToday: vi.fn().mockResolvedValue(undefined),
      refresh: vi.fn().mockResolvedValue(undefined)
    },
    
    // Training methods
    getTrainingStatusForDate: vi.fn().mockReturnValue('none'),
    hasTrainingEntriesForDate: vi.fn().mockReturnValue(false)
  };

  return { ...defaultStore, ...overrides };
}

/**
 * Create a mock error store for testing
 */
export function createMockErrorStore(overrides: Partial<ErrorStore> = {}): ErrorStore {
  const defaultStore: ErrorStore = {
    errors: [],
    hasErrors: false,
    addError: vi.fn(),
    removeError: vi.fn(),
    clearErrors: vi.fn(),
    getErrorsByType: vi.fn().mockReturnValue([]),
    hasErrorOfType: vi.fn().mockReturnValue(false)
  };

  return { ...defaultStore, ...overrides };
}

/**
 * Create a mock auth store for testing
 */
export function createMockAuthStore(overrides: Partial<AuthStore> = {}): AuthStore {
  const defaultStore: AuthStore = {
    user: null,
    isAuthenticated: false,
    isLoading: false,
    error: null,
    login: vi.fn().mockResolvedValue({ success: true }),
    logout: vi.fn().mockResolvedValue(undefined),
    refreshToken: vi.fn().mockResolvedValue(true),
    clearError: vi.fn(),
    setUser: vi.fn()
  };

  return { ...defaultStore, ...overrides };
}

/**
 * Mock API responses for testing
 */
export const mockApiResponses = {
  schedule: {
    success: {
      id: 1,
      start_day: 1,
      start_day_long: '2024-01-01',
      training_week: 1,
      type: 'ultimate' as const,
      trainings: [],
      strength_trainings: [],
      entries: []
    },
    error: {
      error: 'Failed to fetch schedule'
    }
  },
  
  auth: {
    loginSuccess: {
      user: { id: '123', email: 'test@example.com', name: 'Test User' },
      token: 'mock-jwt-token'
    },
    loginError: {
      error: 'Invalid credentials'
    }
  }
};

/**
 * Setup function to mock all stores in a test
 */
export function setupStoreMocks() {
  const calendarStore = createMockCalendarStore();
  const errorStore = createMockErrorStore();
  const authStore = createMockAuthStore();

  return {
    calendarStore,
    errorStore,
    authStore,
    cleanup: () => {
      vi.clearAllMocks();
    }
  };
}
