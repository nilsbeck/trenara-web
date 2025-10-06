/**
 * Authentication-related type definitions
 */

export interface User {
  id: string;
  email: string;
  name?: string;
}

export interface AuthError {
  code: string;
  message: string;
  details?: Record<string, any>;
  status?: number;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface AuthResponse {
  success: boolean;
  user?: User;
  error?: AuthError;
  tokens?: {
    accessToken: string;
    refreshToken: string;
    expiresAt: Date;
  };
}

export interface SessionData {
  userId: string;
  email: string;
  expiresAt: number;
}

export interface AuthStore {
  // State
  readonly user: User | null;
  readonly isAuthenticated: boolean;
  readonly isLoading: boolean;
  readonly error: AuthError | null;
  
  // Actions
  login(credentials: LoginCredentials): Promise<AuthResponse>;
  logout(): Promise<void>;
  refreshToken(): Promise<boolean>;
  clearError(): void;
  setUser(user: User | null): void;
  
  // Store subscription
  subscribe(subscriber: import('./stores.js').StoreSubscriber<AuthStore>): import('./stores.js').StoreUnsubscriber;
}

export interface TokenInfo {
  token: string;
  expiresAt: Date;
}

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: AuthError | null;
  tokens: {
    accessToken: TokenInfo | null;
    refreshToken: TokenInfo | null;
  };
}
