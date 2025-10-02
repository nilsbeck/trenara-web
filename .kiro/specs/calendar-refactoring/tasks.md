# Implementation Plan

- [x] 1. Extract utilities and create foundation layer
  - Create pure utility functions for date calculations and formatting
  - Establish service layer for API interactions
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 4.1, 4.2, 4.3, 4.4_

- [x] 1.1 Create date utility functions
  - Write pure functions for date offset calculations in `src/lib/components/calendar/utils/dateUtils.ts`
  - Implement date formatting utilities with proper TypeScript types
  - Create date validation functions for input sanitization
  - Write comprehensive unit tests for all date utility functions
  - _Requirements: 3.1, 3.2, 3.3, 8.1, 8.2, 9.1, 9.3_

- [x] 1.2 Create calendar math utilities
  - Extract calendar grid generation logic into `src/lib/components/calendar/utils/calendarMath.ts`
  - Implement functions for calculating month offsets, days in month, and grid positioning
  - Create utility for determining first day of month and week calculations
  - Write unit tests covering edge cases like leap years and month boundaries
  - _Requirements: 3.4, 8.1, 9.1, 9.4_

- [x] 1.3 Create calendar service layer
  - Implement `CalendarService` class in `src/lib/components/calendar/services/calendarService.ts`
  - Create methods for fetching month schedule data with error handling and retries
  - Implement nutrition data fetching with caching capabilities
  - Add methods for training operations (delete, change date, feedback) with proper error states
  - Write service layer tests with mocked API responses
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 7.1, 7.2, 7.4, 9.1_

- [x] 1.4 Create enhanced TypeScript interfaces
  - Define comprehensive interfaces in `src/lib/components/calendar/types/enhanced.ts`
  - Create `CalendarState`, `CalendarGridData`, `LoadingStates`, and `ErrorStates` interfaces
  - Define service layer interfaces and error boundary types
  - Ensure all interfaces use strict typing with proper validation
  - _Requirements: 8.1, 8.2, 8.3, 8.4_

- [ ] 2. Create centralized state management with Svelte 5 runes
  - Implement calendar store using modern Svelte 5 patterns
  - Create reactive derived state for complex calculations
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 11.1_

- [ ] 2.1 Implement calendar store with Svelte 5 runes
  - Create `src/lib/components/calendar/stores/calendar.store.ts` using $state and $derived runes
  - Implement reactive state for currentDate, selectedDate, schedule, and UI states
  - Create derived state for selectedDateString, filteredTrainings, and calendarGrid calculations
  - Add store methods for state updates with proper type checking
  - Write comprehensive store tests verifying state transitions and derived calculations
  - _Requirements: 2.1, 2.2, 2.4, 8.4, 9.3, 11.1_

- [ ] 2.2 Create loading and error state management
  - Implement `LoadingManager` utility for tracking multiple loading states
  - Create error state management with user-friendly error messages
  - Add retry mechanisms for failed API calls
  - Integrate loading and error states into the calendar store
  - _Requirements: 2.3, 7.1, 7.2, 7.4_

- [ ] 3. Extract navigation and header components
  - Create focused components for calendar navigation and header display
  - Implement proper event handling with modern Svelte 5 patterns
  - _Requirements: 1.1, 1.2, 1.4, 11.2, 11.3_

- [ ] 3.1 Create CalendarNavigation component
  - Implement `src/lib/components/calendar/CalendarNavigation.svelte` using $props() syntax
  - Create navigation methods for previous/next month and refresh functionality
  - Integrate with calendar store for state management
  - Add proper accessibility attributes and keyboard navigation support
  - Write component tests for navigation interactions
  - _Requirements: 1.4, 11.2, 11.3, 9.2_

- [ ] 3.2 Create CalendarHeader component
  - Implement `src/lib/components/calendar/CalendarHeader.svelte` for month/year display
  - Use calendar store for reactive month and year display
  - Integrate CalendarNavigation component as child component
  - Ensure proper TypeScript typing for all props and events
  - _Requirements: 1.1, 1.2, 8.1, 11.2_

- [ ] 3.3 Create CalendarTitle component
  - Extract title display logic into dedicated `CalendarTitle.svelte` component
  - Implement proper date formatting using utility functions
  - Use derived state from calendar store for reactive updates
  - Add internationalization support for month names
  - _Requirements: 1.2, 3.2, 11.1_

- [ ] 4. Refactor tab management system
  - Extract complex tab logic into reusable TabManager component
  - Implement slot-based composition for tab content
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 11.4_

- [ ] 4.1 Create TabManager component
  - Implement `src/lib/components/calendar/TabManager.svelte` with configurable tab system
  - Create `TabConfig` interface for flexible tab configuration
  - Implement tab visibility logic based on available data
  - Use slots for tab content rendering with proper type safety
  - Write tests for tab switching and visibility logic
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 8.1, 9.2, 11.4_

- [ ] 4.2 Refactor detail components for cleaner interfaces
  - Update `TrainingDetails.svelte` to receive pre-filtered data from store
  - Modify `StrengthDetails.svelte` to focus only on presentation logic
  - Update `NutritionDetails.svelte` to use store-managed data
  - Remove data fetching responsibilities from detail components
  - Ensure all components use modern Svelte 5 patterns
  - _Requirements: 1.3, 6.1, 6.2, 6.3, 11.1, 11.2_

- [ ] 5. Create training data filtering system
  - Implement dedicated filter components for different training types
  - Extract complex data transformation logic
  - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [ ] 5.1 Create training data filters
  - Implement `TrainingFilter.svelte` for date-based training filtering
  - Create separate filter logic for run training, strength training, and nutrition data
  - Extract filtering logic from main calendar component into dedicated utilities
  - Ensure filters integrate with existing training type interfaces
  - Write comprehensive tests for all filter scenarios
  - _Requirements: 6.1, 6.2, 6.4, 9.1, 9.4_

- [ ] 5.2 Implement reactive data filtering in store
  - Add derived state in calendar store for filtered training data
  - Create reactive filters that update when date selection or data changes
  - Optimize filtering performance to prevent unnecessary recalculations
  - Ensure filtered data maintains proper TypeScript typing
  - _Requirements: 6.3, 2.4, 8.4_

- [ ] 6. Implement error boundaries and loading states
  - Create comprehensive error handling system
  - Implement user-friendly loading indicators
  - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [ ] 6.1 Create CalendarErrorBoundary component
  - Implement `src/lib/components/calendar/CalendarErrorBoundary.svelte` for graceful error handling
  - Create fallback UI components for different error scenarios
  - Add retry mechanisms for recoverable errors
  - Implement error logging for debugging purposes
  - Write tests for error boundary behavior
  - _Requirements: 7.1, 7.2, 7.3, 9.1_

- [ ] 6.2 Implement loading state components
  - Create `LoadingIndicator.svelte` for consistent loading UI across calendar
  - Implement section-specific loading states for month data, nutrition, and actions
  - Add loading state management to calendar store
  - Ensure loading indicators don't block user interactions unnecessarily
  - _Requirements: 7.1, 7.3_

- [ ] 7. Refactor main Calendar component
  - Simplify main component to under 100 lines
  - Integrate all child components with proper composition
  - _Requirements: 1.1, 1.2, 10.1, 10.2, 10.3, 10.4_

- [ ] 7.1 Simplify main Calendar component
  - Refactor `src/lib/components/calendar/calendar.svelte` to orchestrate child components
  - Remove business logic and delegate to appropriate child components
  - Ensure component is under 100 lines and focuses on composition
  - Integrate calendar store initialization and error boundary setup
  - Maintain exact same external API for backward compatibility
  - _Requirements: 1.1, 1.2, 10.1, 10.4_

- [ ] 7.2 Integrate all child components
  - Wire CalendarHeader, CalendarGrid, and CalendarDetails components together
  - Ensure proper data flow through calendar store
  - Implement error boundary wrapping for resilient error handling
  - Verify all existing functionality works identically to before refactoring
  - _Requirements: 1.3, 10.2, 10.3_

- [ ] 8. Create comprehensive test suite
  - Implement unit tests for all new components and utilities
  - Create integration tests for component interactions
  - _Requirements: 9.1, 9.2, 9.3, 9.4_

- [ ] 8.1 Write unit tests for utilities and services
  - Create test suite for date utilities covering edge cases and timezone handling
  - Write tests for calendar math utilities including leap years and month boundaries
  - Implement service layer tests with mocked API responses and error scenarios
  - Add store tests verifying state transitions and derived state calculations
  - _Requirements: 9.1, 9.3, 9.4_

- [ ] 8.2 Write component unit tests
  - Create tests for CalendarNavigation component interactions and event handling
  - Write tests for TabManager component with different tab configurations
  - Implement tests for error boundary component with various error scenarios
  - Add tests for all detail components with mocked data inputs
  - _Requirements: 9.1, 9.2_

- [ ] 8.3 Create integration tests
  - Write integration tests for calendar navigation and month switching
  - Create tests for tab switching and data loading workflows
  - Implement tests for error handling and recovery scenarios
  - Add tests for complete user workflows from date selection to detail viewing
  - _Requirements: 9.2, 9.3_

- [ ] 9. Performance validation and optimization
  - Validate performance meets requirements
  - Optimize component rendering and state updates
  - _Requirements: Performance considerations from design_

- [ ] 9.1 Performance testing and optimization
  - Measure calendar load time and ensure it meets <500ms requirement
  - Optimize month navigation to complete within <200ms
  - Ensure date selection updates within <100ms
  - Profile memory usage and optimize for no increase from current implementation
  - _Requirements: Performance metrics from design document_

- [ ] 9.2 Validate backward compatibility
  - Test all existing calendar functionality works identically to before
  - Verify external API remains unchanged for consuming components
  - Ensure all user interactions behave exactly as in current implementation
  - Validate that all training actions, modals, and data display work as before
  - _Requirements: 10.1, 10.2, 10.3, 10.4_
