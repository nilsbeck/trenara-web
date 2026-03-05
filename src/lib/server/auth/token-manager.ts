import type { Cookies } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { TokenType } from './types';
import { authApi } from '$lib/server/trenara/auth';
import type { AuthResponse } from '$lib/server/trenara/types';

export class TokenManager {
	private static instance: TokenManager;
	private isRefreshing = false;
	private refreshQueue: (() => void)[] = [];

	private constructor() {}

	static getInstance(): TokenManager {
		if (!TokenManager.instance) {
			TokenManager.instance = new TokenManager();
		}
		return TokenManager.instance;
	}

	async validateAndRefreshToken(cookies: Cookies): Promise<boolean> {
		const accessToken = this.getToken(cookies, TokenType.AccessToken);
		if (!accessToken) return false;

		const expirationStr = cookies.get(`${TokenType.AccessToken}_expiration`);
		if (!expirationStr) return false;

		const expirationDate = parseInt(expirationStr, 10);
		const nearFutureThreshold = 43200; // 12 hours in seconds
		const now = Math.floor(Date.now() / 1000);

		if (expirationDate - nearFutureThreshold < now && expirationDate > now) {
			return this.refreshToken(cookies);
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
		const refreshTokenValue = this.getToken(cookies, TokenType.RefreshToken);

		if (!refreshTokenValue) {
			this.isRefreshing = false;
			return false;
		}

		try {
			const response = await authApi.refreshToken({ refresh_token: refreshTokenValue });
			const currentDate = new Date();
			const expirationDate = new Date(currentDate.getTime() + response.expires_in * 1000);

			this.setToken(cookies, response.access_token, TokenType.AccessToken, expirationDate);
			this.setToken(cookies, response.refresh_token, TokenType.RefreshToken, expirationDate);

			this.isRefreshing = false;
			this.processRefreshQueue();
			return true;
		} catch {
			this.isRefreshing = false;
			this.processRefreshQueue();
			return false;
		}
	}

	private processRefreshQueue(): void {
		while (this.refreshQueue.length > 0) {
			const callback = this.refreshQueue.shift();
			if (callback) callback();
		}
	}

	getToken(cookies: Cookies, tokenType: TokenType): string | undefined {
		return cookies.get(tokenType.toString());
	}

	setToken(cookies: Cookies, token: string, tokenType: TokenType, expiresAt: Date): void {
		cookies.set(`${tokenType}_expiration`, expiresAt.toISOString(), {
			expires: expiresAt,
			path: '/',
			secure: !dev,
			sameSite: 'lax'
		});

		cookies.set(tokenType.toString(), token, {
			expires: expiresAt,
			path: '/',
			httpOnly: true,
			secure: !dev,
			sameSite: 'lax'
		});
	}

	deleteToken(cookies: Cookies, tokenType: TokenType): void {
		cookies.delete(tokenType.toString(), {
			path: '/',
			httpOnly: true,
			secure: !dev,
			sameSite: 'lax'
		});
		cookies.delete(`${tokenType}_expiration`, {
			path: '/',
			secure: !dev,
			sameSite: 'lax'
		});
	}

	async authenticate(
		email: string,
		password: string
	): Promise<{ success: boolean; cookies?: { access_token: string; refresh_token: string; expiration: Date } }> {
		try {
			const response: AuthResponse = await authApi.login({
				username: email,
				password
			});

			const currentDate = new Date();
			const expirationDate = new Date(currentDate.getTime() + response.expires_in * 1000);

			return {
				success: true,
				cookies: {
					access_token: response.access_token,
					refresh_token: response.refresh_token,
					expiration: expirationDate
				}
			};
		} catch {
			return { success: false };
		}
	}

	async logout(cookies: Cookies): Promise<void> {
		this.deleteToken(cookies, TokenType.AccessToken);
		this.deleteToken(cookies, TokenType.RefreshToken);
		cookies.delete('user_id', { path: '/' });
		cookies.delete('user_email', { path: '/' });
		cookies.delete('trenara_session', { path: '/' });
	}
}
