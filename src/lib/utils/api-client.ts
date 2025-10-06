/**
 * Typed API client utilities
 */

import type { ApiClient, ApiResponse, ApiError, ApiRequestOptions } from '$lib/types/index.js';

class TypedApiClient implements ApiClient {
  private baseUrl: string;
  private defaultOptions: ApiRequestOptions;

  constructor(baseUrl: string = '', defaultOptions: ApiRequestOptions = {}) {
    this.baseUrl = baseUrl;
    this.defaultOptions = {
      timeout: 10000,
      retries: 1,
      ...defaultOptions
    };
  }

  private async makeRequest<T>(
    url: string,
    options: ApiRequestOptions = {}
  ): Promise<ApiResponse<T>> {
    const mergedOptions = { ...this.defaultOptions, ...options };
    const fullUrl = `${this.baseUrl}${url}`;

    let attempt = 0;
    const maxRetries = mergedOptions.retries ?? 1;

    while (attempt <= maxRetries) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), mergedOptions.timeout);

        const response = await fetch(fullUrl, {
          method: mergedOptions.method ?? 'GET',
          headers: {
            'Content-Type': 'application/json',
            ...mergedOptions.headers
          },
          body: mergedOptions.body ? JSON.stringify(mergedOptions.body) : undefined,
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          const apiError: ApiError = {
            code: errorData.code || 'HTTP_ERROR',
            message: errorData.message || response.statusText,
            status: response.status,
            details: errorData.details
          };

          return {
            success: false,
            error: apiError
          };
        }

        const data = await response.json();
        return {
          success: true,
          data
        };

      } catch (error) {
        if (attempt === maxRetries) {
          const apiError: ApiError = {
            code: 'NETWORK_ERROR',
            message: error instanceof Error ? error.message : 'Network request failed',
            status: 0
          };

          return {
            success: false,
            error: apiError
          };
        }

        attempt++;
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }

    // This should never be reached, but TypeScript requires it
    return {
      success: false,
      error: {
        code: 'UNKNOWN_ERROR',
        message: 'Unknown error occurred',
        status: 0
      }
    };
  }

  async get<T>(url: string, options?: ApiRequestOptions): Promise<ApiResponse<T>> {
    return this.makeRequest<T>(url, { ...options, method: 'GET' });
  }

  async post<T>(url: string, data?: any, options?: ApiRequestOptions): Promise<ApiResponse<T>> {
    return this.makeRequest<T>(url, { ...options, method: 'POST', body: data });
  }

  async put<T>(url: string, data?: any, options?: ApiRequestOptions): Promise<ApiResponse<T>> {
    return this.makeRequest<T>(url, { ...options, method: 'PUT', body: data });
  }

  async delete<T>(url: string, options?: ApiRequestOptions): Promise<ApiResponse<T>> {
    return this.makeRequest<T>(url, { ...options, method: 'DELETE' });
  }

  async patch<T>(url: string, data?: any, options?: ApiRequestOptions): Promise<ApiResponse<T>> {
    return this.makeRequest<T>(url, { ...options, method: 'PATCH', body: data });
  }
}

// Create default API client instance
export const apiClient = new TypedApiClient('/api');

// Export the class for custom instances
export { TypedApiClient };

/**
 * Utility functions for common API operations
 */
// Simple cache for API responses
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_DURATION = 30000; // 30 seconds

function getCachedResponse<T>(key: string): T | null {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.data;
  }
  return null;
}

function setCachedResponse<T>(key: string, data: T): void {
  cache.set(key, { data, timestamp: Date.now() });
}

export const api = {
  // Schedule operations
  async getMonthSchedule(date: Date) {
    const cacheKey = `monthSchedule-${date.toISOString()}`;
    const cached = getCachedResponse(cacheKey);
    if (cached) {
      return { success: true, data: cached };
    }
    
    const response = await apiClient.get(`/v0/monthSchedule?timestamp=${date.toISOString()}`);
    if (response.success) {
      setCachedResponse(cacheKey, response.data);
    }
    return response;
  },

  async getUserStats() {
    return apiClient.get('/v0/userStats');
  },

  async getGoal() {
    return apiClient.get('/v0/goal');
  },

  async getNutrition(date: string) {
    return apiClient.get(`/v0/nutrition?timestamp=${date}`);
  },

  async getPredictionHistory() {
    return apiClient.get('/v0/prediction-history');
  },

  // Training operations
  async addTraining(data: any) {
    return apiClient.post('/v0/addTraining', data);
  },

  async deleteTraining(data: any) {
    return apiClient.post('/v0/deleteTraining', data);
  },

  // Auth operations
  async login(credentials: { email: string; password: string }) {
    return apiClient.post('/login', credentials);
  },

  async logout() {
    return apiClient.post('/logout');
  },

  // Feedback
  async submitFeedback(data: any) {
    return apiClient.post('/v0/feedback', data);
  }
};
