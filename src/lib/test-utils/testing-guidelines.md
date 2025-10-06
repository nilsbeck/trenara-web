# Testing Guidelines

This document outlines the testing standards and practices for the Svelte refactoring project.

## Testing Structure

### Test Organization
```
src/
├── lib/
│   ├── components/
│   │   ├── Component.svelte
│   │   └── Component.test.ts
│   ├── stores/
│   │   ├── store.ts
│   │   └── store.test.ts
│   └── utils/
│       ├── utility.ts
│       └── utility.test.ts
└── test-utils/
    ├── index.ts
    ├── store-mocks.ts
    └── testing-guidelines.md
```

### Test Types

#### 1. Unit Tests
- Test individual functions, utilities, and store logic
- Use `describe` and `it` blocks for organization
- Mock external dependencies
- Focus on pure functions and isolated logic

```typescript
import { describe, it, expect } from 'vitest';
import { myUtilityFunction } from './utility.js';

describe('myUtilityFunction', () => {
  it('should return expected result for valid input', () => {
    const result = myUtilityFunction('input');
    expect(result).toBe('expected');
  });
});
```

#### 2. Component Tests
- Test component rendering and user interactions
- Use Testing Library for DOM queries and events
- Mock stores and external dependencies
- Test component props and events

```typescript
import { render, screen, fireEvent } from '@testing-library/svelte';
import { describe, it, expect } from 'vitest';
import MyComponent from './MyComponent.svelte';

describe('MyComponent', () => {
  it('should render with correct props', () => {
    render(MyComponent, { props: { title: 'Test Title' } });
    expect(screen.getByText('Test Title')).toBeInTheDocument();
  });
});
```

#### 3. Store Tests
- Test store state management and reactivity
- Test store actions and side effects
- Mock API calls and external services
- Verify derived state calculations

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { createCalendarStore } from './calendar.store.js';

describe('CalendarStore', () => {
  let store: ReturnType<typeof createCalendarStore>;
  
  beforeEach(() => {
    store = createCalendarStore(new Date('2024-01-15'));
  });
  
  it('should initialize with correct date', () => {
    expect(store.currentDate.getDate()).toBe(15);
  });
});
```

#### 4. Integration Tests
- Test component interactions with stores
- Test API integration points
- Test user workflows and scenarios
- Use realistic data and scenarios

## Testing Utilities

### Available Utilities

#### From `src/lib/test-utils/index.ts`:
- `renderComponent()` - Enhanced component rendering
- `mockFetch()` - Mock fetch with typed responses
- `mockConsole()` - Mock console methods
- `createMockStore()` - Create reactive mock stores
- `waitForReactive()` - Wait for Svelte reactivity
- `mockTimers()` - Mock timer utilities
- `testData` - Test data factories

#### From `src/lib/test-utils/store-mocks.ts`:
- `createMockCalendarStore()` - Mock calendar store
- `createMockErrorStore()` - Mock error store
- `createMockAuthStore()` - Mock auth store
- `setupStoreMocks()` - Setup all store mocks

### Usage Examples

#### Testing Components with Stores
```typescript
import { renderComponent, setupStoreMocks } from '$lib/test-utils';
import MyComponent from './MyComponent.svelte';

describe('MyComponent', () => {
  it('should work with store', () => {
    const { calendarStore } = setupStoreMocks();
    
    renderComponent(MyComponent, {
      context: new Map([['calendar', calendarStore]])
    });
    
    // Test component behavior
  });
});
```

#### Testing API Calls
```typescript
import { mockFetch } from '$lib/test-utils';

describe('API Integration', () => {
  it('should handle API response', async () => {
    const mockResponse = { data: 'test' };
    global.fetch = mockFetch(mockResponse);
    
    // Test API call
    const result = await myApiFunction();
    expect(result).toEqual(mockResponse);
  });
});
```

## Best Practices

### 1. Test Naming
- Use descriptive test names that explain the scenario
- Follow the pattern: "should [expected behavior] when [condition]"
- Group related tests in `describe` blocks

### 2. Test Structure
- Arrange: Set up test data and mocks
- Act: Execute the code being tested
- Assert: Verify the expected outcome

### 3. Mocking Guidelines
- Mock external dependencies (APIs, services)
- Use real implementations for internal utilities when possible
- Mock at the boundary of your system
- Keep mocks simple and focused

### 4. Async Testing
- Use `async/await` for asynchronous operations
- Wait for DOM updates with `waitFor()`
- Use `waitForReactive()` for Svelte reactivity

### 5. Error Testing
- Test both success and error scenarios
- Verify error handling and recovery
- Test edge cases and boundary conditions

### 6. Store Testing
- Test initial state
- Test state mutations
- Test derived state calculations
- Test side effects and async operations

## Coverage Requirements

### Minimum Coverage Thresholds
- Lines: 80%
- Functions: 80%
- Branches: 80%
- Statements: 80%

### Coverage Commands
```bash
# Run tests with coverage
npm run test:coverage

# View coverage report
npm run test:coverage:open
```

## Common Patterns

### Testing Svelte 5 Runes
```typescript
import { createMockStore } from '$lib/test-utils';

describe('Rune Testing', () => {
  it('should react to state changes', async () => {
    const store = createMockStore({ count: 0 });
    
    // Trigger state change
    store.updateState(state => ({ ...state, count: 1 }));
    
    // Wait for reactivity
    await waitForReactive();
    
    expect(store.state.count).toBe(1);
  });
});
```

### Testing Error Boundaries
```typescript
import { createMockErrorStore } from '$lib/test-utils/store-mocks';

describe('Error Handling', () => {
  it('should handle errors gracefully', () => {
    const errorStore = createMockErrorStore();
    
    // Trigger error
    const error = new Error('Test error');
    errorStore.addError(error);
    
    expect(errorStore.addError).toHaveBeenCalledWith(error);
  });
});
```

### Testing Context Providers
```typescript
import { setContext } from 'svelte';

describe('Context Testing', () => {
  it('should provide context to children', () => {
    const mockStore = createMockCalendarStore();
    
    renderComponent(ParentComponent, {
      context: new Map([['calendar', mockStore]])
    });
    
    // Test that children receive context
  });
});
```

## Debugging Tests

### Common Issues
1. **Timing Issues**: Use `waitFor()` or `waitForReactive()`
2. **Mock Issues**: Ensure mocks are properly reset between tests
3. **Context Issues**: Verify context is properly provided to components
4. **Reactivity Issues**: Wait for Svelte's reactivity to complete

### Debugging Tools
- Use `screen.debug()` to see current DOM state
- Use `console.log()` in tests (mocked by default)
- Use `vi.spyOn()` to spy on function calls
- Use breakpoints in test files

## Continuous Integration

Tests run automatically on:
- Pull requests
- Main branch commits
- Release builds

All tests must pass before code can be merged.
