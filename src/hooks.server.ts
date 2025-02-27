import type { Handle } from '@sveltejs/kit';
import * as auth from '$lib/server/auth.js';
import { authApi } from '$lib/server/api';
import type { ApiError, AuthResponse, RefreshTokenRequest } from '$lib/server/api';
import { setSessionTokenCookie, TokenType } from '$lib/server/auth';

const handleAuth: Handle = async ({ event, resolve }) => {
	const sessionToken = event.cookies.get(auth.TokenType.AccessToken);
	if (!sessionToken) {
		event.locals.user = null;
		return resolve(event);
	}

	// Check the expiration time of the sessionToken
	const expirationStr = event.cookies.get(auth.TokenType.AccessToken + '_expiration');
	if (!expirationStr) {
		event.locals.user = null;
		return resolve(event);
	}

	const expirationDate = parseInt(expirationStr, 10);
	const nearFutureThreshold: number = 43200; // 12h, token expires within 24h
	const now = Math.floor(new Date().getTime() / 1000);
	if (expirationDate - nearFutureThreshold < now && expirationDate > now) {
		const refreshToken = event.cookies.get(auth.TokenType.RefreshToken);
		if (refreshToken) {
			try {
				const data: RefreshTokenRequest = {
					refresh_token: refreshToken
				};
				const response: AuthResponse = await authApi.refreshToken(data);
				const currentDate = new Date();
				const expirationDate = new Date(currentDate.getTime() + response.expires_in);
				setSessionTokenCookie(
					event.cookies,
					response.access_token,
					TokenType.AccessToken,
					expirationDate
				);
				setSessionTokenCookie(
					event.cookies,
					response.refresh_token,
					TokenType.RefreshToken,
					expirationDate
				);
			} catch (error) {
				// Handle API errors
				const apiError = error as ApiError;
				if (apiError.status === 401) {
					console.error('Invalid credentials');
				} else {
					console.error('Login failed:', apiError.status);
					// If there are field-specific errors, they'll be in apiError.errors
					if (apiError.errors) {
						console.error('Validation errors:', apiError.errors);
					}
				}
			}
		}
	}

	event.locals.user = 'user';

	return resolve(event);
};

export const handle: Handle = handleAuth;
