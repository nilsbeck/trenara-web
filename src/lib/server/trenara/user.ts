import type { Cookies } from '@sveltejs/kit';
import type { User, UserStats, Shoe, ProfileUpdate } from './types';
import { fetchClient } from './client';
import { TokenType } from '$lib/server/auth/types';
import { cachedRead, CacheKey, invalidate } from './read-cache';
import { expectArray, expectObject } from './shape';

function bearerHeader(cookies: Cookies): Record<string, string> {
	return { Authorization: `Bearer ${cookies.get(TokenType.AccessToken)}` };
}

export const userApi = {
	/**
	 * The signed-in account.
	 *
	 * Cached, because the layout asks for it on every navigation and the answer
	 * is a name and a set of preferences: five identical requests a minute,
	 * against a budget of sixty for the whole app. `updateProfile` drops it, so
	 * an edit is never served from a copy taken before it.
	 */
	async getCurrentUser(cookies: Cookies): Promise<User> {
		return cachedRead(cookies, CacheKey.currentUser, async () =>
			expectObject<User>(
				await fetchClient.get<unknown>('/api/me', {
					headers: bearerHeader(cookies),
					cookies
				}),
				'/api/me'
			)
		);
	},

	/**
	 * Best times, predictions and the weekly graphs.
	 *
	 * On the dashboard and on the goal page both, so it arrived four times in
	 * the minute that tripped the rate limit. Every training write drops it —
	 * an intensity change moves the predictions in here, not just the session.
	 */
	async getUserStats(cookies: Cookies): Promise<UserStats> {
		return cachedRead(cookies, CacheKey.stats, async () =>
			expectObject<UserStats>(
				await fetchClient.get<unknown>('/api/me/stats', {
					headers: bearerHeader(cookies),
					cookies
				}),
				'/api/me/stats'
			)
		);
	},

	/**
	 * Writes the profile block, and optionally the lactate thresholds.
	 *
	 * The body is `ProfileUpdate`, not `Partial<User>` — see that type for why
	 * the two differ. Answers with the whole account, so the result can replace
	 * a cached `getCurrentUser`.
	 */
	async updateProfile(cookies: Cookies, data: ProfileUpdate): Promise<User> {
		const user = await fetchClient.put<User>('/api/me', data, {
			headers: bearerHeader(cookies),
			cookies
		});

		invalidate(cookies, CacheKey.currentUser);
		return user;
	},

	/**
	 * The user's shoe locker.
	 *
	 * Returns a bare array rather than a paginated envelope. Whether retired
	 * shoes are included is unknown — every shoe seen so far has
	 * `retired_at: null`, so filter on it if you need only active pairs.
	 */
	async getShoes(cookies: Cookies): Promise<Shoe[]> {
		return expectArray<Shoe>(
			await fetchClient.get<unknown>('/api/me/shoes', {
				headers: bearerHeader(cookies),
				cookies
			}),
			'/api/me/shoes'
		);
	}
};
