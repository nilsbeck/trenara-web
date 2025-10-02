/**
 * User API module - now using fetch instead of axios
 * Maintains identical interface and behavior
 */

import type { User, UserPreferences, UserStats } from './types';
import { fetchClient } from './fetchClient';
import { getSessionTokenCookie, TokenType } from '../auth';
import { ApiResponseError, handleError, logError } from '$lib/utils/error-handling';
import type { Cookies } from '@sveltejs/kit';

export const userApi = {
    async getCurrentUser(cookies: Cookies): Promise<User> {
        try {
            const response = await fetchClient.get<User>('/api/me', {
                headers: {
                    Authorization: `Bearer ${getSessionTokenCookie(cookies, TokenType.AccessToken)}`
                },
                cookies
            });
            return response;
        } catch (error) {
            logError('Failed to get current user', error as string);
            if (error instanceof Error) {
                throw new ApiResponseError(error.message, 500);
            }
            throw new ApiResponseError('Failed to get current user', 500);
        }
    },

    async updateProfile(cookies: Cookies, data: Partial<User>): Promise<User> {
        try {
            const response = await fetchClient.put<User>('/api/me', data, {
                headers: {
                    Authorization: `Bearer ${getSessionTokenCookie(cookies, TokenType.AccessToken)}`
                },
                cookies
            });
            return response;
        } catch (error) {
            logError('Failed to update profile', error as string);
            if (error instanceof Error) {
                throw new ApiResponseError(error.message, 500);
            }
            throw new ApiResponseError('Failed to update profile', 500);
        }
    },

    async updatePreferences(cookies: Cookies, preferences: Partial<UserPreferences>): Promise<User> {
        try {
            const response = await fetchClient.put<User>('/api/user/preferences', preferences, {
                headers: {
                    Authorization: `Bearer ${getSessionTokenCookie(cookies, TokenType.AccessToken)}`
                },
                cookies
            });
            return response;
        } catch (error) {
            logError('Failed to update preferences', error as string);
            if (error instanceof Error) {
                throw new ApiResponseError(error.message, 500);
            }
            throw new ApiResponseError('Failed to update preferences', 500);
        }
    },

    async getUserStats(cookies: Cookies): Promise<UserStats> {
        try {
            const response = await fetchClient.get<UserStats>('/api/me/stats', {
                headers: {
                    Authorization: `Bearer ${getSessionTokenCookie(cookies, TokenType.AccessToken)}`
                },
                cookies
            });
            return response;
        } catch (error) {
            logError('Failed to get user stats', error as string);
            if (error instanceof Error) {
                throw new ApiResponseError(error.message, 500);
            }
            throw new ApiResponseError('Failed to get user stats', 500);
        }
    }
};
