import type { User, Schedule, Subscription, UserPreferences, UserStats } from './types';
import { apiClient } from './config';
import { getSessionTokenCookie, TokenType } from '../auth';
import type { Cookies } from '@sveltejs/kit';

export const userApi = {
	async getCurrentUser(cookies: Cookies): Promise<User> {
		const response = await apiClient.getAxios().get<User>('/api/me', {
			headers: {
				Authorization: `Bearer ${getSessionTokenCookie(cookies, TokenType.AccessToken)}`
			}
		});
		return response.data;
	},

	async updateProfile(cookies: Cookies, data: Partial<User>): Promise<User> {
		const response = await apiClient.getAxios().put<User>('/api/me', data);
		return response.data;
	},

	async updatePreferences(cookies: Cookies, preferences: Partial<UserPreferences>): Promise<User> {
		const response = await apiClient.getAxios().put<User>('/api/user/preferences', preferences);
		return response.data;
	},

	async getUserStats(cookies: Cookies): Promise<UserStats> {
		const response = await apiClient.getAxios().get<UserStats>('/api/me/stats', {
			headers: {
				Authorization: `Bearer ${getSessionTokenCookie(cookies, TokenType.AccessToken)}`
			}
		});
		return response.data;
	}
};
