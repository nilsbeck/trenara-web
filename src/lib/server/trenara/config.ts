import type { Cookies } from '@sveltejs/kit';
import type { AppConfig } from './types';
import { fetchClient } from './client';
import { TokenType } from '$lib/server/auth/types';

function bearerHeader(cookies: Cookies): Record<string, string> {
	return { Authorization: `Bearer ${cookies.get(TokenType.AccessToken)}` };
}

/**
 * An hour. The response changes when the API ships, not when a runner does
 * anything, so this only has to be short enough that a deploy is picked up the
 * same day.
 */
const TTL_MS = 60 * 60 * 1000;

let cached: { value: AppConfig; expiresAt: number } | null = null;
let inFlight: Promise<AppConfig> | null = null;

export const configApi = {
	/**
	 * The app's static configuration: option lists and copy.
	 *
	 * Cached for the whole process rather than per request, which is only sound
	 * because the response carries no user data — every account gets the same
	 * bytes. A token is still sent, since that is what the endpoint expects.
	 *
	 * Concurrent callers share one request: a cold cache and ten simultaneous
	 * page loads should not be ten fetches.
	 */
	async getAppConfig(cookies: Cookies): Promise<AppConfig> {
		if (cached && cached.expiresAt > Date.now()) return cached.value;
		if (inFlight) return inFlight;

		inFlight = fetchClient
			.get<AppConfig>('/api/config/app', { headers: bearerHeader(cookies), cookies })
			.then((value) => {
				cached = { value, expiresAt: Date.now() + TTL_MS };
				return value;
			})
			.finally(() => {
				inFlight = null;
			});

		return inFlight;
	},

	/** Drops the cache. For tests, and for anything that has to force a refetch. */
	clearAppConfigCache(): void {
		cached = null;
		inFlight = null;
	}
};
