# Standardized Data Fetching Patterns

This document outlines the standardized data fetching patterns used throughout the application.

## Overview

We use a consistent approach to data fetching that provides:
- Automatic loading states
- Error handling with retry logic
- Caching with TTL (Time To Live)
- Type safety
- Consistent error messages

## Core Utilities

### `createAsyncData<T>(fetcher, options)`

Creates a reactive data store with loading, error, and data states.

```typescript
const userData = createAsyncData(
  async () => {
    const response = await fetch('/api/user');
    return response.json();
  },
  {
    retries: 2,
    retryDelay: 1000,
    onSuccess: (data) => console.log('Loaded:', data),
    onError: (error) => console.error('Failed:', error)
  }
);

// Usage in component
$effect(() => {
  userData.load();
});

// Access reactive state
$: isLoading = userData.loading;
$: error = userData.error;
$: data = userData.data;
```

### `createCachedAsyncData<T>(fetcher, cacheKey, ttl, options)`

Same as `createAsyncData` but with automatic caching.

```typescript
const cachedData = createCachedAsyncData(
  fetcher,
  'user-data',
  5 * 60 * 1000, // 5 minutes cache
  options
);
```

## Pre-built Hooks

### Calendar Data
```typescript
import { useScheduleData } from '$lib/utils/data-fetching.ts';

const scheduleData = useScheduleData(new Date());
```

### User Statistics
```typescript
import { useUserStatsData } from '$lib/utils/data-fetching.ts';

const userStats = useUserStatsData();
```

### Goal Data
```typescript
import { useGoalData } from '$lib/utils/data-fetching.ts';

const goalData = useGoalData();
```

### Predictions
```typescript
import { usePredictionsData } from '$lib/utils/data-fetching.ts';

const predictions = usePredictionsData();
```

### Prediction History
```typescript
import { usePredictionHistoryData } from '$lib/utils/data-fetching.ts';

const history = usePredictionHistoryData(goal?.start_date, 100);
```

### Prediction Tracking
```typescript
import { usePredictionTracking } from '$lib/utils/data-fetching.ts';

const tracking = usePredictionTracking();

// Track a prediction
await tracking.trackPrediction('1:23:45', '4:30 min/km');
```

## Error Handling

All hooks handle common error scenarios:

- **Authentication Required (401)**: Gracefully handled, often not shown to user
- **Database Unavailable (503)**: Shows user-friendly message with retry option
- **Network Errors**: Automatic retry with exponential backoff
- **Server Errors**: Generic error message with retry option

## Component Integration Patterns

### Basic Pattern
```svelte
<script lang="ts">
  import { useUserStatsData } from '$lib/utils/data-fetching.ts';
  
  const userData = useUserStatsData();
  
  $effect(() => {
    userData.load();
  });
  
  function retry() {
    userData.reload();
  }
</script>

{#if userData.loading}
  <Loading />
{:else if userData.error}
  <ErrorMessage error={userData.error} onRetry={retry} />
{:else if userData.data}
  <UserDisplay data={userData.data} />
{:else}
  <EmptyState />
{/if}
```

### Hybrid Pattern (Props + Fetching)
```svelte
<script lang="ts">
  import { usePredictionsData } from '$lib/utils/data-fetching.ts';
  
  // Accept data as props for backward compatibility
  let { userStats }: { userStats?: UserStats } = $props();
  
  // Use fetching if no props provided
  const predictionsData = userStats ? null : usePredictionsData();
  
  // Determine data source
  let predictions = $derived(() => {
    if (userStats?.best_times) {
      return userStats.best_times;
    }
    return predictionsData?.data || null;
  });
  
  $effect(() => {
    if (!userStats && predictionsData) {
      predictionsData.load();
    }
  });
</script>
```

## Best Practices

1. **Always handle loading states**: Show loading indicators for better UX
2. **Provide retry mechanisms**: Allow users to retry failed operations
3. **Use appropriate cache TTL**: Balance freshness with performance
4. **Handle authentication gracefully**: Don't show auth errors to logged-out users
5. **Use derived state**: Compute display values reactively
6. **Implement fallback data**: Show cached/fallback data when possible
7. **Log errors appropriately**: Console errors for debugging, user-friendly messages for UI

## Migration Guide

### From Manual Fetch to Standardized Hook

**Before:**
```svelte
<script lang="ts">
  let data = $state(null);
  let loading = $state(false);
  let error = $state(null);
  
  async function loadData() {
    loading = true;
    try {
      const response = await fetch('/api/data');
      data = await response.json();
    } catch (err) {
      error = err;
    } finally {
      loading = false;
    }
  }
  
  $effect(() => {
    loadData();
  });
</script>
```

**After:**
```svelte
<script lang="ts">
  import { createAsyncData } from '$lib/utils/data-fetching.ts';
  
  const dataStore = createAsyncData(async () => {
    const response = await fetch('/api/data');
    return response.json();
  });
  
  $effect(() => {
    dataStore.load();
  });
</script>

{#if dataStore.loading}
  <Loading />
{:else if dataStore.error}
  <Error error={dataStore.error} />
{:else if dataStore.data}
  <Display data={dataStore.data} />
{/if}
```

## Testing

All data fetching utilities are designed to be easily testable:

```typescript
import { createAsyncData } from '$lib/utils/data-fetching.ts';

// Mock the fetcher
const mockFetcher = vi.fn();
const dataStore = createAsyncData(mockFetcher);

// Test loading state
expect(dataStore.loading).toBe(false);

// Test load
await dataStore.load();
expect(mockFetcher).toHaveBeenCalled();
```

## Performance Considerations

- **Caching**: Reduces API calls and improves performance
- **Data Sampling**: Large datasets are automatically sampled for charts
- **Lazy Loading**: Data is only loaded when needed
- **Retry Logic**: Prevents unnecessary retries with exponential backoff
- **Memory Management**: Caches have TTL to prevent memory leaks
