import type { Cookies } from '@sveltejs/kit';
import type { User, UserStats, Shoe } from './types';
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
	},

	/**
	 * The user's shoe locker.
	 *
	 * Returns a bare array rather than a paginated envelope. Whether retired
	 * shoes are included is unknown — every shoe seen so far has
	 * `retired_at: null`, so filter on it if you need only active pairs.
	 */
	async getShoes(cookies: Cookies): Promise<Shoe[]> {
		return fetchClient.get<Shoe[]>('/api/me/shoes', {
			headers: bearerHeader(cookies),
			cookies
		});
	}
};
