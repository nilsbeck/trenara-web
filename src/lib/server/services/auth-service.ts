/**
 * Authentication Service - Dependency Injection Pattern
 * Replaces singleton TokenManager with injectable service
 */

import type { Cookies } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { TokenType } from '$lib/server/auth/types';
import { authApi } from '../api';
import type { AuthResponse, ApiError } from '../api/types';

export interface AuthService {
  validateAndRefreshToken(cookies: Cookies): Promise<boolean>;
  authenticate(email: string, password: string): Promise<AuthResult>;
  logout(cookies: Cookies): Promise<void>;
  getToken(cookies: Cookies, tokenType: TokenType): string | undefined;
  setToken(cookies: Cookies, token: string, tokenType: TokenType, expiresAt: Date): void;
  deleteToken(cookies: Cookies, tokenType: TokenType): void;
}

export interface AuthResult {
  success: boolean;
  user?: {
    id: string;
    email: string;
  };
  cookies?: {
    access_token: string;
    refresh_token: string;
    expiration: Date;
  };
  error?: string;
}

export class DefaultAuthService implements AuthService {
  private isRefreshing = false;
  private refreshQueue: (() => void)[] = [];

  async validateAndRefreshToken(cookies: Cookies): Promise<boolean> {
    const accessToken = this.getToken(cookies, TokenType.AccessToken);
    if (!accessToken) return false;

    const expirationStr = cookies.get(`${TokenType.AccessToken}_expiration`);
    if (!expirationStr) return false;

    const expirationDate = parseInt(expirationStr, 10);
    const nearFutureThreshold = 43200; // 12h
    const now = Math.floor(new Date().getTime() / 1000);

    if (expirationDate - nearFutureThreshold < now && expirationDate > now) {
      return await this.refreshToken(cookies);
    }

    return true;
  }

  private async refreshToken(cookies: Cookies): Promise<boolean> {
    if (this.isRefreshing) {
      return new Promise((resolve) => {
        this.refreshQueue.push(() => resolve(true));
      });
    }

    this.isRefreshing = true;
    const refreshToken = this.getToken(cookies, TokenType.RefreshToken);

    if (!refreshToken) {
      this.isRefreshing = false;
      return false;
    }

    try {
      const response = await authApi.refreshToken({ refresh_token: refreshToken });
      const currentDate = new Date();
      const expirationDate = new Date(currentDate.getTime() + response.expires_in);

      this.setToken(cookies, response.access_token, TokenType.AccessToken, expirationDate);
      this.setToken(cookies, response.refresh_token, TokenType.RefreshToken, expirationDate);

      this.isRefreshing = false;
      this.processRefreshQueue();
      return true;
    } catch (error) {
      this.isRefreshing = false;
      this.processRefreshQueue();
      this.handleAuthError(error as ApiError);
      return false;
    }
  }

  private processRefreshQueue() {
    while (this.refreshQueue.length > 0) {
      const callback = this.refreshQueue.shift();
      if (callback) callback();
    }
  }

  private handleAuthError(error: ApiError) {
    switch (error.status) {
      case 401:
        console.error('Authentication failed: Invalid credentials');
        break;
      case 403:
        console.error('Authentication failed: Insufficient permissions');
        break;
      default:
        console.error('Authentication failed:', error.status, error.message);
        if (error.errors) {
          console.error('Validation errors:', error.errors);
        }
    }
  }

  getToken(cookies: Cookies, tokenType: TokenType): string | undefined {
    return cookies.get(tokenType.toString());
  }

  setToken(cookies: Cookies, token: string, tokenType: TokenType, expiresAt: Date): void {
    const cookieOptions = {
      expires: expiresAt,
      path: '/',
      secure: !dev,
      sameSite: 'lax' as const
    };

    const tokenCookieOptions = {
      expires: expiresAt,
      path: '/',
      httpOnly: true,
      secure: !dev,
      sameSite: 'lax' as const
    };

    // Debug logging for production
    if (!dev) {
      console.log('Setting token cookies with options:', {
        tokenType: tokenType.toString(),
        secure: !dev,
        sameSite: 'lax',
        dev: dev
      });
    }

    cookies.set(`${tokenType}_expiration`, expiresAt.toISOString(), cookieOptions);
    cookies.set(tokenType.toString(), token, tokenCookieOptions);
  }

  deleteToken(cookies: Cookies, tokenType: TokenType): void {
    cookies.delete(tokenType.toString(), {
      path: '/',
      httpOnly: true,
      secure: !dev,
      sameSite: 'lax'
    });
  }

  async authenticate(email: string, password: string): Promise<AuthResult> {
    try {
      const response: AuthResponse = await authApi.login({
        username: email,
        password: password
      });

      const currentDate = new Date();
      const expirationDate = new Date(currentDate.getTime() + response.expires_in * 1000);

      return {
        success: true,
        user: {
          id: email, // Using email as ID since we don't have user ID
          email: email
        },
        cookies: {
          access_token: response.access_token,
          refresh_token: response.refresh_token,
          expiration: expirationDate
        }
      };
    } catch (error) {
      console.error('Authentication failed:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Authentication failed'
      };
    }
  }

  async logout(cookies: Cookies): Promise<void> {
    this.deleteToken(cookies, TokenType.AccessToken);
    this.deleteToken(cookies, TokenType.RefreshToken);
  }
}

// Factory function for creating auth service instances
export function createAuthService(): AuthService {
  return new DefaultAuthService();
}
