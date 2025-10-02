# Calendar Refactoring Design Document

## Overview

This design document outlines the refactoring of the monolithic calendar component into a modular, maintainable architecture using Svelte 5 patterns. The refactoring will decompose the current 300+ line component into focused, single-responsibility components while preserving all existing functionality and improving testability, performance, and developer experience.

## Architecture

### High-Level Component Structure

```
Calendar (Main Container - <100 lines)
├── CalendarHeader
│   ├── CalendarNavigation
│   └── CalendarTitle
├── CalendarGrid
│   └── CalendarCell (existing, minimal changes)
├── CalendarDetails
│   ├── TabManager
│   │   ├── TrainingTab
│   │   ├── StrengthTab
│   │   └── NutritionTab
│   └── DetailContent (slot-based)
└── CalendarErrorBoundary
```

### State Management Architecture

The calendar will use a centralized state management approach with Svelte 5 runes:

```typescript
// calendar.store.ts
export const calendarStore = {
  // Core state
  currentDate: $state(new Date()),
  selectedDate: $state<CalendarDate | null>(null),
  
  // Data state
  schedule: $state<Schedule | null>(null),
  nutritionData: $state<NutritionAdvice | null>(null),
  
  // UI state
  selectedTab: $state(Tab.Training),
  isLoading: $state(false),
  error: $state<string | null>(null),
  
  // Derived state
  selectedDateString: $derived(/* date formatting logic */),
  filteredTrainings: $derived(/* training filtering logic */),
  calendarGrid: $derived(/* grid calculation logic */)
}
```

## Components and Interfaces

### 1. Calendar (Main Container)

**Responsibility**: Orchestrate child components and manage top-level state
**Size**: <100 lines
**Props**: `CalendarProps`

```typescript
interface CalendarProps {
  today: Date;
  schedule: Schedule;
}
```

**Key Features**:
- Initialize calendar store
- Render child components
- Handle error boundaries
- Minimal business logic

### 2. CalendarHeader

**Responsibility**: Display month/year and navigation controls
**Props**: None (uses store)

```typescript
interface CalendarHeaderProps {
  // No props - uses calendar store
}
```

### 3. CalendarNavigation

**Responsibility**: Handle month navigation and refresh functionality
**Props**: None (uses store)

**Events**:
- `previousMonth()`
- `nextMonth()`
- `refresh()`

### 4. CalendarGrid

**Responsibility**: Render the calendar grid with days
**Props**: Minimal (uses store for state)

**Key Changes**:
- Remove complex prop drilling
- Use store for calendar state
- Maintain existing CalendarCell component

### 5. TabManager

**Responsibility**: Manage tab switching and visibility logic
**Props**: Tab configuration

```typescript
interface TabManagerProps {
  tabs: TabConfig[];
  selectedTab: Tab;
  onTabChange: (tab: Tab) => void;
}

interface TabConfig {
  id: Tab;
  label: string;
  visible: boolean;
  content: ComponentType;
}
```

### 6. Detail Components (TrainingDetails, StrengthDetails, NutritionDetails)

**Responsibility**: Display specific training data
**Props**: Filtered data from store

**Key Changes**:
- Receive pre-filtered data instead of raw schedule
- Focus on presentation logic only
- Remove data fetching responsibilities

## Data Models

### Enhanced Calendar State

```typescript
interface CalendarState {
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
  errors: ErrorStates;
}

interface CalendarGridData {
  daysInMonthWithOffset: number[];
  firstDayOfMonth: number;
  offsetAtStart: number;
  offsetAtEnd: number;
}

interface LoadingStates {
  monthData: boolean;
  nutrition: boolean;
  actions: boolean;
}

interface ErrorStates {
  monthData: string | null;
  nutrition: string | null;
  actions: string | null;
}
```

### Service Layer Interfaces

```typescript
interface CalendarService {
  getMonthSchedule(date: Date): Promise<Schedule>;
  getNutritionData(date: string): Promise<NutritionAdvice>;
  deleteTraining(id: number): Promise<void>;
  changeDateTraining(id: number, newDate: Date): Promise<Schedule>;
  submitFeedback(entryId: number, feedback: number): Promise<void>;
}
```

## Error Handling

### Error Boundary Strategy

1. **Component-Level Error Boundaries**: Each major component section will have error boundaries
2. **Graceful Degradation**: Failed sections won't crash the entire calendar
3. **User-Friendly Messages**: Clear error messages with retry options
4. **Logging**: Comprehensive error logging for debugging

```typescript
interface ErrorBoundaryProps {
  fallback: ComponentType<{ error: Error; retry: () => void }>;
  onError?: (error: Error) => void;
}
```

### Loading State Management

```typescript
interface LoadingManager {
  setLoading(key: string, loading: boolean): void;
  isLoading(key: string): boolean;
  isAnyLoading(): boolean;
}
```

## Testing Strategy

### Unit Testing Approach

1. **Utility Functions**: Pure functions for date calculations, formatting, and validation
2. **Component Testing**: Individual components with mocked dependencies
3. **Store Testing**: State management logic with predictable inputs/outputs
4. **Service Testing**: API interactions with mocked responses

### Test Structure

```
tests/
├── unit/
│   ├── utils/
│   │   ├── dateUtils.test.ts
│   │   ├── calendarMath.test.ts
│   │   └── formatters.test.ts
│   ├── components/
│   │   ├── CalendarNavigation.test.ts
│   │   ├── TabManager.test.ts
│   │   └── CalendarGrid.test.ts
│   └── stores/
│       └── calendar.store.test.ts
├── integration/
│   ├── calendar-navigation.test.ts
│   ├── tab-switching.test.ts
│   └── data-loading.test.ts
└── e2e/
    └── calendar-workflow.test.ts
```

## Implementation Strategy

### Phase 1: Extract Utilities and Services

**Rationale**: Create the foundation layer that other components will depend on

**Components**:
- `dateUtils.ts` - Pure date calculation functions
- `calendarMath.ts` - Grid generation and offset calculations
- `formatters.ts` - Date and data formatting utilities
- `calendarService.ts` - API interaction layer

### Phase 2: Create State Management

**Rationale**: Establish centralized state before creating components that depend on it

**Components**:
- `calendar.store.ts` - Svelte 5 runes-based state management
- `types.ts` - Enhanced TypeScript interfaces

### Phase 3: Extract Navigation and Header

**Rationale**: Start with simpler components that have fewer dependencies

**Components**:
- `CalendarNavigation.svelte`
- `CalendarHeader.svelte`
- `CalendarTitle.svelte`

### Phase 4: Refactor Tab Management

**Rationale**: Simplify the complex conditional rendering logic

**Components**:
- `TabManager.svelte`
- Enhanced detail components with cleaner interfaces

### Phase 5: Refactor Main Calendar

**Rationale**: Final step to tie everything together and remove old code

**Components**:
- Simplified `Calendar.svelte` (main container)
- Error boundary implementation
- Integration testing

### Phase 6: Testing and Validation

**Rationale**: Ensure all functionality works as before

**Activities**:
- Comprehensive test suite
- Performance validation
- User acceptance testing
- Documentation updates

## Migration Strategy

### Backward Compatibility

1. **Gradual Migration**: Components will be migrated one at a time
2. **Interface Preservation**: External API remains unchanged
3. **Feature Flags**: New components can be toggled during development
4. **Rollback Plan**: Ability to revert to original implementation if needed

### Risk Mitigation

1. **Comprehensive Testing**: Extensive test coverage before deployment
2. **Staged Rollout**: Deploy to staging environment first
3. **Monitoring**: Track performance and error rates post-deployment
4. **Documentation**: Clear migration guide for future developers

## Performance Considerations

### Optimization Strategies

1. **Derived State Caching**: Use Svelte 5 $derived for efficient reactivity
2. **Component Lazy Loading**: Load detail components only when needed
3. **Data Caching**: Cache API responses at service layer
4. **Minimal Re-renders**: Optimize component dependencies to prevent unnecessary updates

### Performance Metrics

- Calendar load time: <500ms (requirement)
- Month navigation: <200ms
- Date selection: <100ms
- Memory usage: No increase from current implementation

## Security Considerations

1. **Input Validation**: All date inputs validated before processing
2. **API Security**: Maintain existing authentication patterns
3. **XSS Prevention**: Proper sanitization of user-generated content
4. **Type Safety**: TypeScript interfaces prevent many runtime errors

## Accessibility

1. **Keyboard Navigation**: Full keyboard support for all interactions
2. **Screen Reader Support**: Proper ARIA labels and descriptions
3. **Focus Management**: Logical focus flow through calendar components
4. **Color Contrast**: Maintain existing accessibility standards
