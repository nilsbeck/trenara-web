/**
 * Error boundary utilities with Svelte 5 runes
 */

import type { ErrorBoundary } from '$lib/types/index.js';

/**
 * Create an error boundary for component error handling
 */
export function createErrorBoundary(
  retryFn?: () => Promise<void>
): ErrorBoundary {
  let error = $state<Error | null>(null);

  let hasError = $derived(!!error);

  const handleError = (err: Error) => {
    error = err;
    console.error('Component error:', err);

    // Optional error reporting
    if (typeof window !== 'undefined' && 'reportError' in window) {
      (window as any).reportError(err);
    }

    // Log to console with stack trace in development
    if (import.meta.env.DEV) {
      console.error('Error stack:', err.stack);
    }
  };

  const clearError = () => {
    error = null;
  };

  const retry = retryFn ? async () => {
    error = null;
    try {
      await retryFn();
    } catch (err) {
      handleError(err as Error);
    }
  } : undefined;

  return {
    get error() { return error; },
    get hasError() { return hasError; },
    handleError,
    clearError,
    retry
  };
}

/**
 * Global error handler for unhandled errors
 */
export function setupGlobalErrorHandler() {
  if (typeof window === 'undefined') return;

  // Handle unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
    
    // Prevent the default browser behavior
    event.preventDefault();
    
    // You could send this to an error reporting service
    if (import.meta.env.PROD) {
      // reportError(event.reason);
    }
  });

  // Handle general errors
  window.addEventListener('error', (event) => {
    console.error('Global error:', event.error);
    
    if (import.meta.env.PROD) {
      // reportError(event.error);
    }
  });
}

/**
 * Async error wrapper for safe promise handling
 */
export async function safeAsync<T>(
  asyncFn: () => Promise<T>,
  fallback?: T
): Promise<{ data: T | null; error: Error | null }> {
  try {
    const data = await asyncFn();
    return { data, error: null };
  } catch (error) {
    console.error('Async operation failed:', error);
    return { 
      data: fallback ?? null, 
      error: error instanceof Error ? error : new Error('Unknown error') 
    };
  }
}

/**
 * Error classification utilities
 */
export class ErrorClassifier {
  static isNetworkError(error: Error): boolean {
    return error.message.includes('fetch') || 
           error.message.includes('network') ||
           error.message.includes('Failed to fetch');
  }

  static isAuthError(error: Error): boolean {
    return error.message.includes('401') ||
           error.message.includes('403') ||
           error.message.includes('Unauthorized') ||
           error.message.includes('Authentication');
  }

  static isValidationError(error: Error): boolean {
    return error.message.includes('validation') ||
           error.message.includes('invalid') ||
           error.message.includes('required');
  }

  static getErrorType(error: Error): 'network' | 'auth' | 'validation' | 'unknown' {
    if (this.isNetworkError(error)) return 'network';
    if (this.isAuthError(error)) return 'auth';
    if (this.isValidationError(error)) return 'validation';
    return 'unknown';
  }

  static getUserFriendlyMessage(error: Error): string {
    const type = this.getErrorType(error);
    
    switch (type) {
      case 'network':
        return 'Network connection failed. Please check your internet connection and try again.';
      case 'auth':
        return 'Authentication failed. Please log in again.';
      case 'validation':
        return 'Please check your input and try again.';
      default:
        return 'An unexpected error occurred. Please try again.';
    }
  }
}

/**
 * Retry utilities
 */
export class RetryHandler {
  static async withRetry<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    delay: number = 1000,
    backoff: boolean = true
  ): Promise<T> {
    let attempt = 0;
    
    while (attempt <= maxRetries) {
      try {
        return await fn();
      } catch (error) {
        if (attempt === maxRetries) {
          throw error;
        }
        
        attempt++;
        const waitTime = backoff ? delay * Math.pow(2, attempt - 1) : delay;
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
    
    throw new Error('Max retries exceeded');
  }

  static shouldRetry(error: Error): boolean {
    // Don't retry auth errors or validation errors
    if (ErrorClassifier.isAuthError(error) || ErrorClassifier.isValidationError(error)) {
      return false;
    }
    
    // Retry network errors
    return ErrorClassifier.isNetworkError(error);
  }
}
