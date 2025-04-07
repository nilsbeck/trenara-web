import type { User, UserPreferences, UserStats } from './types';
import { apiClient } from './config';
import { getSessionTokenCookie, TokenType } from '../auth';
import { ApiResponseError, handleError, logError } from '$lib/utils/error-handling';
import type { Cookies } from '@sveltejs/kit';

export const userApi = {
	async getCurrentUser(cookies: Cookies): Promise<User> {
		try {
			const response = await apiClient.getAxios().get<User>('/api/me', {
				headers: {
					Authorization: `Bearer ${getSessionTokenCookie(cookies, TokenType.AccessToken)}`
				}
			});

			if (!response.data) {
				throw new ApiResponseError('User data not found', 404);
			}

			return response.data;
		} catch (error) {
			logError(error, 'getCurrentUser');
			throw handleError(error);
		}
	},

	async updateProfile(cookies: Cookies, data: Partial<User>): Promise<User> {
		try {
			const response = await apiClient.getAxios().put<User>('/api/me', data, {
				headers: {
					Authorization: `Bearer ${getSessionTokenCookie(cookies, TokenType.AccessToken)}`
				}
			});

			if (!response.data) {
				throw new ApiResponseError('Failed to update profile', 400);
			}

			return response.data;
		} catch (error) {
			logError(error, 'updateProfile');
			throw handleError(error);
		}
	},

	async updatePreferences(cookies: Cookies, preferences: Partial<UserPreferences>): Promise<User> {
		try {
			const response = await apiClient.getAxios().put<User>('/api/user/preferences', preferences, {
				headers: {
					Authorization: `Bearer ${getSessionTokenCookie(cookies, TokenType.AccessToken)}`
				}
			});

			if (!response.data) {
				throw new ApiResponseError('Failed to update preferences', 400);
			}

			return response.data;
		} catch (error) {
			logError(error, 'updatePreferences');
			throw handleError(error);
		}
	},

	async getUserStats(cookies: Cookies): Promise<UserStats> {
		try {
			const response = await apiClient.getAxios().get<UserStats>('/api/me/stats', {
				headers: {
					Authorization: `Bearer ${getSessionTokenCookie(cookies, TokenType.AccessToken)}`
				}
			});

			if (!response.data) {
				throw new ApiResponseError('User stats not found', 404);
			}

			return response.data;
		} catch (error) {
			logError(error, 'getUserStats');
			throw handleError(error);
		}
	}
};
