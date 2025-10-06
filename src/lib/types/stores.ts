/**
 * Store-related type definitions
 */

import type { CalendarStore } from './calendar.js';
import type { AuthStore } from './auth.js';

export interface AsyncData<T> {
  readonly data: T | null;
  readonly loading: boolean;
  readonly error: Error | null;
  load(): Promise<void>;
  reload(): Promise<void>;
  reset(): void;
  subscribe(subscriber: StoreSubscriber<{ data: T | null; loading: boolean; error: Error | null }>): StoreUnsubscriber;
}

export interface AsyncDataOptions {
  onError?: (error: Error) => void;
  onSuccess?: (data: any) => void;
  retries?: number;
  retryDelay?: number;
}

export interface ErrorBoundary {
  readonly error: Error | null;
  readonly hasError: boolean;
  handleError(error: Error): void;
  clearError(): void;
  retry?(): Promise<void>;
}

export interface AppError {
  id: string;
  type: 'auth' | 'network' | 'validation' | 'unknown';
  message: string;
  timestamp: Date;
  context?: Record<string, any>;
}

export interface ErrorStore {
  readonly errors: AppError[];
  readonly hasErrors: boolean;
  addError(error: AppError | Error | string): void;
  removeError(id: string): void;
  clearErrors(): void;
  getErrorsByType(type: AppError['type']): AppError[];
  hasErrorOfType(type: AppError['type']): boolean;
  subscribe(subscriber: StoreSubscriber<ErrorStore>): StoreUnsubscriber;
}

export interface StoreContext {
  auth: AuthStore;
  calendar: CalendarStore;
  error: ErrorStore;
}

export interface StoreOptions {
  persist?: boolean;
  key?: string;
  storage?: 'localStorage' | 'sessionStorage';
}

export type StoreSubscriber<T> = (value: T) => void;
export type StoreUnsubscriber = () => void;
