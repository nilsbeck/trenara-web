/**
 * Calendar service layer for API interactions
 * Handles data fetching, caching, error handling, and retries
 */

import type { Schedule, NutritionAdvice, ChangedDateResonse } from '$lib/server/api/types';

export interface CalendarServiceConfig {
  baseUrl?: string;
  retryAttempts?: number;
  retryDelay?: number;
  cacheTimeout?: number;
}

export interface ServiceError {
  message: string;
  status: number;
  code: string;
  retryable: boolean;
}

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

export class CalendarService {
  private config: Required<CalendarServiceConfig>;
  private cache = new Map<string, CacheEntry<any>>();

  constructor(config: CalendarServiceConfig = {}) {
    this.config = {
      baseUrl: config.baseUrl || '/api/v0',
      retryAttempts: config.retryAttempts || 3,
      retryDelay: config.retryDelay || 1000,
      cacheTimeout: config.cacheTimeout || 5 * 60 * 1000 // 5 minutes
    };
  }

  /**
   * Fetches month schedule data with error handling and retries
   * @param date - The date for the month to fetch
   * @returns Promise resolving to Schedule data
   */
  async getMonthSchedule(date: Date): Promise<Schedule> {
    const cacheKey = `schedule-${date.getFullYear()}-${date.getMonth()}`;
    
    // Check cache first
    const cached = this.getFromCache<Schedule>(cacheKey);
    if (cached) {
      return cached;
    }

    const url = `${this.config.baseUrl}/monthSchedule/?timestamp=${date.getTime()}`;
    
    try {
      const data = await this.fetchWithRetry<Schedule>(url);
      this.setCache(cacheKey, data);
      return data;
    } catch (error) {
      throw this.createServiceError(error, 'Failed to fetch month schedule');
    }
  }

  /**
   * Fetches nutrition data with caching capabilities
   * @param dateString - Date string in YYYY-MM-DD format
   * @returns Promise resolving to NutritionAdvice data
   */
  async getNutritionData(dateString: string): Promise<NutritionAdvice> {
    const cacheKey = `nutrition-${dateString}`;
    
    // Check cache first
    const cached = this.getFromCache<NutritionAdvice>(cacheKey);
    if (cached) {
      return cached;
    }

    const url = `${this.config.baseUrl}/nutrition?timestamp=${dateString}`;
    
    try {
      const data = await this.fetchWithRetry<NutritionAdvice>(url);
      this.setCache(cacheKey, data);
      return data;
    } catch (error) {
      throw this.createServiceError(error, 'Failed to fetch nutrition data');
    }
  }

  /**
   * Deletes a training with proper error handling
   * @param trainingId - ID of the training to delete
   * @returns Promise resolving when deletion is complete
   */
  async deleteTraining(trainingId: number): Promise<void> {
    const url = `${this.config.baseUrl}/training/${trainingId}`;
    
    try {
      await this.fetchWithRetry<void>(url, {
        method: 'DELETE'
      });
      
      // Invalidate related caches
      this.invalidateScheduleCaches();
    } catch (error) {
      throw this.createServiceError(error, 'Failed to delete training');
    }
  }

  /**
   * Changes the date of a training
   * @param trainingId - ID of the training to modify
   * @param newDate - New date for the training
   * @returns Promise resolving to updated Schedule
   */
  async changeDateTraining(trainingId: number, newDate: Date): Promise<Schedule> {
    const url = `${this.config.baseUrl}/training/${trainingId}/change-date`;
    
    try {
      const response = await this.fetchWithRetry<ChangedDateResonse>(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          new_date: newDate.toISOString().split('T')[0]
        })
      });
      
      if (!response.success) {
        throw new Error('Training date change was not successful');
      }
      
      // Invalidate related caches
      this.invalidateScheduleCaches();
      
      return response.schedule;
    } catch (error) {
      throw this.createServiceError(error, 'Failed to change training date');
    }
  }

  /**
   * Submits feedback for a training entry
   * @param entryId - ID of the entry to provide feedback for
   * @param feedback - Feedback rating (typically 1-5)
   * @returns Promise resolving when feedback is submitted
   */
  async submitFeedback(entryId: number, feedback: number): Promise<void> {
    const url = `${this.config.baseUrl}/entry/${entryId}/feedback`;
    
    try {
      await this.fetchWithRetry<void>(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          rating: feedback
        })
      });
    } catch (error) {
      throw this.createServiceError(error, 'Failed to submit feedback');
    }
  }

  /**
   * Generic fetch method with retry logic
   * @param url - URL to fetch
   * @param options - Fetch options
   * @returns Promise resolving to parsed JSON data
   */
  private async fetchWithRetry<T>(
    url: string, 
    options: RequestInit = {}
  ): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 0; attempt <= this.config.retryAttempts; attempt++) {
      try {
        const response = await fetch(url, {
          ...options,
          headers: {
            'Content-Type': 'application/json',
            ...options.headers
          }
        });

        if (!response.ok) {
          const error = new Error(`HTTP ${response.status}: ${response.statusText}`);
          (error as any).status = response.status;
          (error as any).retryable = this.isRetryableStatus(response.status);
          throw error;
        }

        // Handle void responses
        if (response.status === 204 || response.headers.get('content-length') === '0') {
          return undefined as T;
        }

        return await response.json();
      } catch (error) {
        lastError = error as Error;
        
        // Don't retry if it's not retryable or if it's the last attempt
        if (!this.isRetryableError(error as Error) || attempt === this.config.retryAttempts) {
          throw error;
        }
        
        // Wait before retrying
        await this.delay(this.config.retryDelay * Math.pow(2, attempt));
      }
    }
    
    throw lastError!;
  }

  /**
   * Determines if an error is retryable
   * @param error - The error to check
   * @returns True if the error is retryable
   */
  private isRetryableError(error: Error): boolean {
    // Network errors are retryable
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      return true;
    }
    
    // Check if it's an HTTP error with retryable status
    const status = (error as any).status;
    return status ? this.isRetryableStatus(status) : false;
  }

  /**
   * Determines if an HTTP status is retryable
   * @param status - HTTP status code
   * @returns True if the status is retryable
   */
  private isRetryableStatus(status: number): boolean {
    // Retry on server errors and some client errors
    return status >= 500 || status === 408 || status === 429;
  }

  /**
   * Creates a standardized service error
   * @param originalError - The original error
   * @param message - User-friendly error message
   * @returns ServiceError object
   */
  private createServiceError(originalError: unknown, message: string): ServiceError {
    const error = originalError as Error & { status?: number };
    
    return {
      message,
      status: error.status || 0,
      code: error.name || 'UNKNOWN_ERROR',
      retryable: this.isRetryableError(error)
    };
  }

  /**
   * Delays execution for the specified number of milliseconds
   * @param ms - Milliseconds to delay
   * @returns Promise that resolves after the delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Gets data from cache if it exists and hasn't expired
   * @param key - Cache key
   * @returns Cached data or null if not found/expired
   */
  private getFromCache<T>(key: string): T | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return null;
    }
    
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.data;
  }

  /**
   * Sets data in cache with expiration
   * @param key - Cache key
   * @param data - Data to cache
   */
  private setCache<T>(key: string, data: T): void {
    const now = Date.now();
    this.cache.set(key, {
      data,
      timestamp: now,
      expiresAt: now + this.config.cacheTimeout
    });
  }

  /**
   * Invalidates all schedule-related caches
   */
  private invalidateScheduleCaches(): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith('schedule-')) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clears all cached data
   */
  public clearCache(): void {
    this.cache.clear();
  }

  /**
   * Gets cache statistics for debugging
   * @returns Cache statistics
   */
  public getCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys())
    };
  }
}
