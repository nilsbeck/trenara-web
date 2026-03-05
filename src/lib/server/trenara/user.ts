import type { Cookies } from '@sveltejs/kit';
import type { User, UserStats } from './types';
import { fetchClient } from './client';
import { TokenType } from '$lib/server/auth/types';

function bearerHeader(cookies: Cookies): Record<string, string> {
	return { Authorization: `Bearer ${cookies.get(TokenType.AccessToken)}` };
}

export const userApi = {
	async getCurrentUser(cookies: Cookies): Promise<User> {
		return fetchClient.get<User>('/api/me', {
			headers: bearerHeader(cookies),
			cookies
		});
	},

	async getUserStats(cookies: Cookies): Promise<UserStats> {
		return fetchClient.get<UserStats>('/api/me/stats', {
			headers: bearerHeader(cookies),
			cookies
		});
	},

	async updateProfile(cookies: Cookies, data: Partial<User>): Promise<User> {
		return fetchClient.put<User>('/api/me', data, {
			headers: bearerHeader(cookies),
			cookies
		});
	}
};
