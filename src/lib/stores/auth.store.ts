/**
 * Authentication store using traditional Svelte stores
 */

import { writable, derived } from 'svelte/store';
import type { AuthStore, User, AuthError, LoginCredentials, AuthResponse } from '$lib/types/index.js';
import { api } from '$lib/utils/api-client.js';

/**
 * Create an authentication store instance
 */
export function createAuthStore(): AuthStore {
  // Core state stores
  const user = writable<User | null>(null);
  const isLoading = writable(false);
  const error = writable<AuthError | null>(null);

  // Derived state
  const isAuthenticated = derived(user, ($user) => !!$user);

  // Actions
  const login = async (credentials: LoginCredentials): Promise<AuthResponse> => {
    isLoading.set(true);
    error.set(null);

    try {
      const response = await api.login(credentials);
      
      if (response.success && response.data) {
        const authData = response.data;
        if (authData.user) {
          user.set(authData.user);
        }
        
        return {
          success: true,
          user: authData.user,
          tokens: authData.tokens
        };
      } else {
        const authError: AuthError = {
          code: response.error?.code || 'LOGIN_FAILED',
          message: response.error?.message || 'Login failed',
          status: response.error?.status
        };
        error.set(authError);
        
        return {
          success: false,
          error: authError
        };
      }
    } catch (err) {
      const authError: AuthError = {
        code: 'NETWORK_ERROR',
        message: err instanceof Error ? err.message : 'Network error occurred',
        status: 0
      };
      error.set(authError);
      
      return {
        success: false,
        error: authError
      };
    } finally {
      isLoading.set(false);
    }
  };

  const logout = async (): Promise<void> => {
    isLoading.set(true);
    
    try {
      await api.logout();
    } catch (err) {
      console.error('Logout error:', err);
      // Continue with logout even if API call fails
    } finally {
      user.set(null);
      error.set(null);
      isLoading.set(false);
    }
  };

  const refreshToken = async (): Promise<boolean> => {
    try {
      // Implementation would depend on your refresh token API
      // For now, return false to indicate refresh failed
      return false;
    } catch (err) {
      console.error('Token refresh error:', err);
      return false;
    }
  };

  const clearError = (): void => {
    error.set(null);
  };

  const setUser = (newUser: User | null): void => {
    user.set(newUser);
  };

  return {
    // Store subscriptions
    subscribe: derived(
      [user, isAuthenticated, isLoading, error],
      ([$user, $isAuthenticated, $isLoading, $error]) => ({
        user: $user,
        isAuthenticated: $isAuthenticated,
        isLoading: $isLoading,
        error: $error
      })
    ).subscribe,
    
    // Direct property access for compatibility
    get user() { 
      let value: User | null;
      user.subscribe(v => value = v)();
      return value!;
    },
    get isAuthenticated() { 
      let value: boolean;
      isAuthenticated.subscribe(v => value = v)();
      return value!;
    },
    get isLoading() { 
      let value: boolean;
      isLoading.subscribe(v => value = v)();
      return value!;
    },
    get error() { 
      let value: AuthError | null;
      error.subscribe(v => value = v)();
      return value!;
    },
    
    // Actions
    login,
    logout,
    refreshToken,
    clearError,
    setUser
  };
}

// Global auth store instance
export const authStore = createAuthStore();

// Utility functions for authentication
export function getCurrentUser(): User | null {
  return authStore.user;
}

export function isUserAuthenticated(): boolean {
  return authStore.isAuthenticated;
}

export function clearAuthError(): void {
  authStore.clearError();
}

// Auto-logout on token expiration (if you have token expiration logic)
export function setupAuthTokenMonitoring(): void {
  // Implementation would depend on your token management
  // This is a placeholder for token expiration monitoring
}
