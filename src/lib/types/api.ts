/**
 * API-related type definitions
 */

export interface ApiResponse<T = any> {
  data?: T;
  error?: ApiError;
  success: boolean;
  message?: string;
}

export interface ApiError {
  code: string;
  message: string;
  status: number;
  details?: Record<string, any>;
  errors?: Record<string, string[]>;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  body?: any;
  timeout?: number;
  retries?: number;
}

export interface ApiClient {
  get<T>(url: string, options?: ApiRequestOptions): Promise<ApiResponse<T>>;
  post<T>(url: string, data?: any, options?: ApiRequestOptions): Promise<ApiResponse<T>>;
  put<T>(url: string, data?: any, options?: ApiRequestOptions): Promise<ApiResponse<T>>;
  delete<T>(url: string, options?: ApiRequestOptions): Promise<ApiResponse<T>>;
  patch<T>(url: string, data?: any, options?: ApiRequestOptions): Promise<ApiResponse<T>>;
}

export interface FetchOptions {
  retries?: number;
  retryDelay?: number;
  timeout?: number;
  onError?: (error: ApiError) => void;
  onRetry?: (attempt: number, error: ApiError) => void;
}

export interface CacheOptions {
  ttl?: number; // Time to live in milliseconds
  key?: string;
  invalidateOn?: string[];
}
