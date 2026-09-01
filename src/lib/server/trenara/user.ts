import type { Cookies } from '@sveltejs/kit';
import type { User, UserStats, Shoe, ProfileUpdate, PauseGoalRequest } from './types';
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
	 *
	 * **Nothing calls this.** The profile page is read-only and there is no
	 * route behind it, which reads at a glance like a feature that half-landed.
	 * It is kept deliberately rather than deleted: this app talks to a
	 * reverse-engineered API, and a verified request shape for `PUT /api/me` is
	 * the expensive half of that knowledge — `docs/backend-api.md` documents the
	 * endpoint and names this as its client method, and `api.test.ts` pins the
	 * body it sends. Deleting the code would leave the documentation pointing at
	 * nothing and cost a capture that took real traffic to obtain.
	 *
	 * So: unused, on purpose, and ready for the editable profile page it was
	 * written for. If that page is never wanted, delete this, its tests, the
	 * `ProfileUpdate` type and the `PUT /api/me` row in the docs together.
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
	},

	/**
	 * Pause the plan, with the reason the runner picked.
	 *
	 * Lives on the account rather than on the goal — the path is `/api/me/pause/`
	 * and the state it sets is read back as `is_paused`, `paused_since` and
	 * `pause_cause` on `GET /api/me`, not on `GET /api/goal`. The trailing slash
	 * is load-bearing enough to be worth not tidying away: see the conventions in
	 * `docs/backend-api.md`.
	 *
	 * The whole cache is dropped rather than the account alone, and deliberately.
	 * A paused plan is not only a flag on the profile: the sessions ahead of the
	 * pause are what the runner is about to stop doing, so the weeks, the stats
	 * and the goal are all suspect the moment this returns. `updateProfile` above
	 * narrows its invalidation because a change of weight cannot reach the plan;
	 * this one can, and guessing how far would be exactly the reasoning
	 * `read-cache.ts` warns against.
	 *
	 * The response shape has not been captured, so it is passed back as-is rather
	 * than typed into something it might not be. Nothing reads it — the caller
	 * refetches, because the interesting part of the answer is the three fields
	 * on `/api/me` and not whatever this returns.
	 */
	async pausePlan(cookies: Cookies, body: PauseGoalRequest): Promise<unknown> {
		const result = await fetchClient.post<unknown>('/api/me/pause/', body, {
			headers: bearerHeader(cookies),
			cookies
		});

		invalidate(cookies);
		return result;
	}
};
