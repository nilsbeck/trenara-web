import type { Cookies } from '@sveltejs/kit';
import { TokenType } from '$lib/server/auth/types';

/**
 * Not asking Trenara the same thing twice in a minute.
 *
 * Trenara allows 60 requests a minute — measured, from the `x-ratelimit-limit`
 * on a refusal — and this app was spending 47 of them in one instance alone.
 * Half of that was `/api/schedule/week/`: there is no month endpoint, so a
 * month costs five or six, and paging between two months buys the same weeks
 * again every time although nothing about them has changed.
 *
 * Two savings, from one structure:
 *
 * 1. **Repeats.** A read taken a moment ago is served from here, so returning
 *    to a month just visited costs nothing at all.
 * 2. **Duplicates in flight.** An entry holds the *promise*, not the answer,
 *    so a caller arriving while the first is still waiting joins it instead of
 *    opening its own request. The report that prompted this showed every
 *    endpoint doubled inside ten seconds — two loads racing — and this
 *    collapses each pair into one request without either caller knowing.
 *
 * What it is not: a way to serve something stale to whoever asked for fresh.
 * The refresh button passes `fresh` and goes to Trenara, and every write drops
 * what it could have changed.
 */

/**
 * The default life of a cached read.
 *
 * A minute, matching the window the limit is counted over: it collapses the
 * repeats inside one burst of navigation, which is where the waste is, without
 * holding anything long enough for a change made elsewhere to feel stuck.
 */
export const DEFAULT_TTL_MS = 60_000;

/** A ceiling on the map, so a long-lived instance cannot grow without bound. */
const MAX_ENTRIES = 500;

interface Entry {
	at: number;
	/** The in-flight or settled request, so concurrent callers share one. */
	value: Promise<unknown>;
}

const cache = new Map<string, Entry>();

/**
 * Which runner a read belongs to.
 *
 * The access token itself, compared exactly. A hash would be tidier and is not
 * worth it: a collision here would serve one runner's plan to another, and
 * exact string equality cannot collide. `TokenManager` keys its in-flight
 * refreshes the same way.
 */
function userKey(cookies: Cookies): string | null {
	return cookies.get(TokenType.AccessToken) ?? null;
}

function prune(now: number): void {
	for (const [key, entry] of cache) {
		if (now - entry.at >= DEFAULT_TTL_MS) cache.delete(key);
	}

	// Still too many once the expired ones have gone: drop oldest first.
	if (cache.size > MAX_ENTRIES) {
		const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at);
		for (const [key] of oldest.slice(0, cache.size - MAX_ENTRIES)) cache.delete(key);
	}
}

/**
 * Serve a read from memory when it is there, and fetch it once when it is not.
 *
 * `fresh` skips the lookup — the answer still goes in, so the request that
 * could not be avoided at least saves the next one.
 */
export function cachedRead<T>(
	cookies: Cookies,
	key: string,
	read: () => Promise<T>,
	{ fresh = false, ttl = DEFAULT_TTL_MS }: { fresh?: boolean; ttl?: number } = {}
): Promise<T> {
	const user = userKey(cookies);

	// No token, no per-user key, and a shared one would be a leak. Nothing is
	// held for a request that is about to fail authentication anyway.
	if (!user) return read();

	const now = Date.now();
	prune(now);

	const cacheKey = `${user}:${key}`;
	const cached = cache.get(cacheKey);
	if (!fresh && cached && now - cached.at < ttl) {
		return cached.value as Promise<T>;
	}

	const value = read();
	cache.set(cacheKey, { at: now, value });

	// A failure must not be remembered: the next caller should try again rather
	// than be handed the same rejection for the rest of the minute.
	value.catch(() => {
		if (cache.get(cacheKey)?.value === value) cache.delete(cacheKey);
	});

	return value;
}

/**
 * Drop what one runner has cached, all of it or one kind.
 *
 * Called with no prefix by every training write, which is deliberately crude:
 * changing a session's intensity moves the week it sits in *and* the
 * predictions in `/api/me/stats`, and deciding which reads a given write can
 * reach is the kind of reasoning that goes quietly wrong a year later. The
 * cost of being crude is one spare request; the cost of being clever and
 * wrong is a plan on screen that disagrees with what the runner just did.
 *
 * `prefix` is there for a caller that genuinely knows better — `updateProfile`
 * drops the account and leaves the plan alone.
 */
export function invalidate(cookies: Cookies, prefix = ''): void {
	const user = userKey(cookies);
	if (!user) return;

	const full = `${user}:${prefix}`;
	for (const key of cache.keys()) {
		if (key.startsWith(full)) cache.delete(key);
	}
}

/** Key prefixes, so an invalidation and its reads cannot drift apart. */
export const CacheKey = {
	week: (timestamp: number) => `week:${timestamp}`,
	weeks: 'week:',
	currentUser: 'me',
	goal: 'goal',
	stats: 'stats'
} as const;

/** Testing seam — the cache is module-wide and outlives a single case. */
export function resetReadCache(): void {
	cache.clear();
}

/** For tests and diagnostics: how many reads are held right now. */
export function readCacheSize(): number {
	return cache.size;
}
