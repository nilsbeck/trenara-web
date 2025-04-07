import type { Cookies } from '@sveltejs/kit';
import { TokenType } from '$lib/server/auth/types';
import { authApi } from '../api';
import type { AuthResponse, ApiError } from '../api/types';

export class TokenManager {
    private static instance: TokenManager;
    private isRefreshing = false;
    private refreshQueue: (() => void)[] = [];

    private constructor() {}

    public static getInstance(): TokenManager {
        if (!TokenManager.instance) {
            TokenManager.instance = new TokenManager();
        }
        return TokenManager.instance;
    }

    public async validateAndRefreshToken(cookies: Cookies): Promise<boolean> {
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

    public getToken(cookies: Cookies, tokenType: TokenType): string | undefined {
        return cookies.get(tokenType.toString());
    }

    public setToken(cookies: Cookies, token: string, tokenType: TokenType, expiresAt: Date) {
        cookies.set(`${tokenType}_expiration`, expiresAt.toISOString(), {
            expires: expiresAt,
            path: '/',
            secure: true,
            sameSite: 'strict'
        });

        cookies.set(tokenType.toString(), token, {
            expires: expiresAt,
            path: '/',
            httpOnly: true,
            secure: true,
            sameSite: 'strict'
        });
    }

    public deleteToken(cookies: Cookies, tokenType: TokenType) {
        cookies.delete(tokenType.toString(), {
            path: '/',
            httpOnly: true,
            secure: true,
            sameSite: 'strict'
        });
    }
} 
