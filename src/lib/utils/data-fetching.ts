/**
 * Data fetching utilities using Svelte stores
 */

import { writable, derived } from 'svelte/store';
import type { AsyncData, AsyncDataOptions, ApiError } from '$lib/types/index.js';

/**
 * Create an async data store with loading, error, and data state
 */
export function createAsyncData<T>(
  fetcher: () => Promise<T>,
  options: AsyncDataOptions = {}
): AsyncData<T> {
  const data = writable<T | null>(null);
  const loading = writable(false);
  const error = writable<Error | null>(null);

  let isLoading = false;

  const load = async () => {
    if (isLoading) return; // Prevent concurrent loads

    loading.set(true);
    error.set(null);
    isLoading = true;

    let attempt = 0;
    const maxRetries = options.retries ?? 0;

    while (attempt <= maxRetries) {
      try {
        const result = await fetcher();
        data.set(result);
        
        if (options.onSuccess) {
          options.onSuccess(result);
        }
        
        loading.set(false);
        isLoading = false;
        return;
      } catch (err) {
        const currentError = err as Error;
        
        if (attempt < maxRetries) {
          attempt++;
          const delay = options.retryDelay ?? 1000;
          await new Promise(resolve => setTimeout(resolve, delay * attempt));
          continue;
        }
        
        error.set(currentError);
        
        if (options.onError) {
          options.onError(currentError);
        }
        
        loading.set(false);
        isLoading = false;
        throw currentError;
      }
    }
  };

  const reset = () => {
    data.set(null);
    error.set(null);
    loading.set(false);
    isLoading = false;
  };

  return {
    subscribe: derived([data, loading, error], ([$data, $loading, $error]) => ({
      data: $data,
      loading: $loading,
      error: $error
    })).subscribe,
    get data() { 
      let value: T | null;
      data.subscribe(v => value = v)();
      return value!;
    },
    get loading() { 
      let value: boolean;
      loading.subscribe(v => value = v)();
      return value!;
    },
    get error() { 
      let value: Error | null;
      error.subscribe(v => value = v)();
      return value!;
    },
    load,
    reload: load,
    reset
  };
}

/**
 * Create a cached async data store
 */
export function createCachedAsyncData<T>(
  fetcher: () => Promise<T>,
  cacheKey: string,
  ttl: number = 5 * 60 * 1000, // 5 minutes default
  options: AsyncDataOptions = {}
): AsyncData<T> {
  const cache = new Map<string, { data: T; timestamp: number }>();
  
  const cachedFetcher = async (): Promise<T> => {
    const cached = cache.get(cacheKey);
    const now = Date.now();
    
    if (cached && (now - cached.timestamp) < ttl) {
      return cached.data;
    }
    
    const result = await fetcher();
    cache.set(cacheKey, { data: result, timestamp: now });
    return result;
  };

  return createAsyncData(cachedFetcher, options);
}

/**
 * Utility for common data fetching patterns
 */
export class DataFetcher {
  private static cache = new Map<string, { data: any; timestamp: number }>();

  static async fetchWithRetry<T>(
    fetcher: () => Promise<T>,
    retries: number = 3,
    delay: number = 1000
  ): Promise<T> {
    let attempt = 0;
    
    while (attempt <= retries) {
      try {
        return await fetcher();
      } catch (error) {
        if (attempt === retries) {
          throw error;
        }
        
        attempt++;
        await new Promise(resolve => setTimeout(resolve, delay * attempt));
      }
    }
    
    throw new Error('Max retries exceeded');
  }

  static async fetchWithCache<T>(
    fetcher: () => Promise<T>,
    cacheKey: string,
    ttl: number = 5 * 60 * 1000
  ): Promise<T> {
    const cached = this.cache.get(cacheKey);
    const now = Date.now();
    
    if (cached && (now - cached.timestamp) < ttl) {
      return cached.data;
    }
    
    const result = await fetcher();
    this.cache.set(cacheKey, { data: result, timestamp: now });
    return result;
  }

  static clearCache(pattern?: string): void {
    if (pattern) {
      const regex = new RegExp(pattern);
      for (const key of this.cache.keys()) {
        if (regex.test(key)) {
          this.cache.delete(key);
        }
      }
    } else {
      this.cache.clear();
    }
  }
}

/**
 * Hook for schedule data fetching
 */
export function useScheduleData(date: Date) {
  const fetcher = async () => {
    const response = await fetch(`/api/v0/monthSchedule?timestamp=${date.toISOString()}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch schedule: ${response.statusText}`);
    }
    return response.json();
  };

  return createCachedAsyncData(
    fetcher,
    `schedule-${date.getFullYear()}-${date.getMonth()}`,
    5 * 60 * 1000, // 5 minutes cache
    {
      onError: (error) => {
        console.error('Failed to load schedule data:', error);
      }
    }
  );
}

/**
 * Hook for user stats data fetching
 */
export function useUserStatsData() {
  const fetcher = async () => {
    const response = await fetch('/api/v0/userStats');
    if (!response.ok) {
      throw new Error(`Failed to fetch user stats: ${response.statusText}`);
    }
    return response.json();
  };

  return createCachedAsyncData(
    fetcher,
    'user-stats',
    10 * 60 * 1000, // 10 minutes cache
    {
      onError: (error) => {
        console.error('Failed to load user stats:', error);
      }
    }
  );
}

/**
 * Hook for goal data fetching
 */
export function useGoalData() {
  const fetcher = async () => {
    const response = await fetch('/api/v0/goal');
    if (!response.ok) {
      throw new Error(`Failed to fetch goal: ${response.statusText}`);
    }
    return response.json();
  };

  return createCachedAsyncData(
    fetcher,
    'goal',
    5 * 60 * 1000, // 5 minutes cache
    {
      onError: (error) => {
        console.error('Failed to load goal data:', error);
      }
    }
  );
}

/**
 * Hook for predictions data fetching (race time predictions)
 */
export function usePredictionsData() {
  const fetcher = async () => {
    const response = await fetch('/api/v0/userStats');
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      
      if (response.status === 401) {
        const error = new Error('Authentication required to load predictions') as ApiError;
        error.code = 'AUTHENTICATION_REQUIRED';
        error.status = 401;
        throw error;
      }
      
      throw new Error(errorData.error || `Failed to fetch predictions: ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.best_times; // Return just the predictions part
  };

  return createCachedAsyncData(
    fetcher,
    'predictions',
    10 * 60 * 1000, // 10 minutes cache
    {
      retries: 2,
      retryDelay: 1000,
      onError: (error) => {
        console.error('Failed to load predictions:', error);
      }
    }
  );
}

/**
 * Hook for prediction history data fetching
 */
export function usePredictionHistoryData(goalStartDate?: string, limit: number = 100) {
  const fetcher = async () => {
    const params = new URLSearchParams();
    if (goalStartDate) {
      params.append('start_date', goalStartDate);
    }
    params.append('limit', limit.toString());

    const response = await fetch(`/api/v0/prediction-history?${params}`);
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      
      // Handle specific error cases
      if (response.status === 503 && errorData.code === 'DATABASE_UNAVAILABLE') {
        const error = new Error('Prediction tracking is temporarily unavailable') as ApiError;
        error.code = 'DATABASE_UNAVAILABLE';
        error.status = 503;
        error.fallback = errorData.fallback;
        error.records = errorData.records;
        throw error;
      }
      
      if (response.status === 401) {
        const error = new Error('Authentication required to load prediction history') as ApiError;
        error.code = 'AUTHENTICATION_REQUIRED';
        error.status = 401;
        throw error;
      }
      
      throw new Error(errorData.error || `Server error: ${response.status}`);
    }

    return response.json();
  };

  const cacheKey = `prediction-history-${goalStartDate || 'all'}-${limit}`;
  
  return createCachedAsyncData(
    fetcher,
    cacheKey,
    5 * 60 * 1000, // 5 minutes cache
    {
      retries: 2,
      retryDelay: 1000,
      onError: (error) => {
        console.error('Failed to load prediction history:', error);
      }
    }
  );
}

/**
 * Hook for tracking prediction changes
 */
export function usePredictionTracking() {
  const isTracking = writable(false);
  const error = writable<Error | null>(null);

  const trackPrediction = async (predictedTime: string, predictedPace: string) => {
    let currentlyTracking: boolean;
    isTracking.subscribe(v => currentlyTracking = v)();
    
    if (currentlyTracking!) return;

    isTracking.set(true);
    error.set(null);

    try {
      const response = await fetch('/api/v0/prediction-history', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          predicted_time: predictedTime,
          predicted_pace: predictedPace
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        
        // Handle specific error cases
        if (response.status === 503 && errorData.code === 'DATABASE_UNAVAILABLE') {
          const trackingError = new Error('Prediction tracking is temporarily unavailable') as ApiError;
          trackingError.code = 'DATABASE_UNAVAILABLE';
          trackingError.status = 503;
          throw trackingError;
        }
        
        if (response.status === 401) {
          // Don't throw error for authentication issues - this is expected for logged-out users
          console.log('User not authenticated for prediction tracking');
          return { stored: false, message: 'Authentication required' };
        }
        
        throw new Error(errorData.error || `Server error: ${response.status}`);
      }

      const result = await response.json();
      return result;
    } catch (err) {
      const trackingError = err as Error;
      
      // Don't set error for authentication issues
      if (!trackingError.message.includes('401') && !trackingError.message.toLowerCase().includes('auth')) {
        error.set(trackingError);
      }
      
      throw trackingError;
    } finally {
      isTracking.set(false);
    }
  };

  return {
    subscribe: derived([isTracking, error], ([$isTracking, $error]) => ({
      isTracking: $isTracking,
      error: $error
    })).subscribe,
    get isTracking() { 
      let value: boolean;
      isTracking.subscribe(v => value = v)();
      return value!;
    },
    get error() { 
      let value: Error | null;
      error.subscribe(v => value = v)();
      return value!;
    },
    trackPrediction,
    clearError: () => { error.set(null); }
  };
}
