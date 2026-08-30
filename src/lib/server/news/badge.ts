import type { Cookies } from '@sveltejs/kit';
import { newsApi } from '$lib/server/trenara';
import { newsReadStateDAO } from '$lib/server/db/news-read-state';
import { newestOf, summarizeUnread, type UnreadSummary } from '$lib/utils/news-unread';

/**
 * The unread-news badge, ready for the navbar.
 *
 * This runs on every page load behind the layout's streamed data, so it is
 * cached: news changes a few times a month, and a badge that is ten minutes
 * stale is invisible to the reader while a second upstream call on every
 * navigation is not.
 */

const CACHE_TTL_MS = 10 * 60 * 1000;

interface CacheEntry {
	summary: UnreadSummary;
	expiresAt: number;
}

/**
 * Per-user badge cache.
 *
 * Module scope, so on Vercel it lives for as long as the serverless instance
 * does and is not shared between them. That is fine for what it holds: a miss
 * costs one upstream call, and the value is advisory either way.
 */
const cache = new Map<number, CacheEntry>();

/** Drop a reader's cached badge, so the next load recomputes it. */
export function clearBadgeCache(userId: number): void {
	cache.delete(userId);
}

/** Testing seam — the cache outlives a single test otherwise. */
export function clearAllBadgeCache(): void {
	cache.clear();
}

/**
 * How long a page render will wait for the badge before going without it.
 *
 * The layout awaits this rather than streaming it, and that is the right call:
 * streamed, the dot was absent from the first paint and popped in a moment
 * later, on the same button as the avatar. But awaiting it without a bound put
 * an upstream call and a database round trip on the critical path of first
 * paint whenever the cache was cold — which on serverless is every new
 * instance.
 *
 * So it is awaited, briefly. A warm cache answers in microseconds and nothing
 * changes; a cold one gets a fifth of a second and then the page goes on
 * without a badge, which is exactly what the component already renders when
 * the answer is not knowable. The computation keeps running and populates the
 * cache for the next navigation.
 */
const BADGE_WAIT_MS = 200;

/**
 * The badge, or nothing if it is not ready in time.
 *
 * A dot is worth no part of first paint. This is the only caller a page should
 * use; `loadNewsBadge` below is the unbounded version, for anything that
 * genuinely needs the answer.
 */
export async function newsBadgeIfReady(
	cookies: Cookies,
	userId: number
): Promise<UnreadSummary | null> {
	const cached = cache.get(userId);
	if (cached && cached.expiresAt > Date.now()) return cached.summary;

	// `loadNewsBadge` reports its own failures as null and never rejects, so
	// the race cannot reject either.
	return Promise.race([
		loadNewsBadge(cookies, userId),
		new Promise<null>((resolve) => setTimeout(() => resolve(null), BADGE_WAIT_MS))
	]);
}

/**
 * How many news items the reader has not seen.
 *
 * Returns null when the answer is not knowable — news unreachable, database
 * down. A badge nobody can justify is worse than no badge, so the navbar shows
 * nothing rather than guessing.
 *
 * A reader with no mark yet is seeded to whatever is newest right now and
 * reported as having nothing unread. The one item this can cost them is one
 * published between their first page load and their first look at the feed;
 * the alternative is greeting every existing user with a badge for a backlog
 * they have already chosen not to read.
 */
export async function loadNewsBadge(
	cookies: Cookies,
	userId: number
): Promise<UnreadSummary | null> {
	const cached = cache.get(userId);
	if (cached && cached.expiresAt > Date.now()) {
		return cached.summary;
	}

	try {
		const [news, mark] = await Promise.all([
			newsApi.getNews(cookies, 1),
			newsReadStateDAO.getMark(userId)
		]);

		const items = news.data ?? [];
		const now = Math.floor(Date.now() / 1000);

		let summary: UnreadSummary;
		if (mark === null) {
			const newest = newestOf(items);
			// Nothing to seed from yet: leave the reader unmarked so the first
			// item to arrive is genuinely new to them rather than pre-read.
			if (newest !== null) {
				await newsReadStateDAO.advanceMark(userId, newest);
			}
			summary = { count: 0, capped: false };
		} else {
			summary = summarizeUnread(items, mark, now, (news.pagination?.total_pages ?? 1) > 1);
		}

		cache.set(userId, { summary, expiresAt: Date.now() + CACHE_TTL_MS });
		return summary;
	} catch (e) {
		console.error('Failed to compute news badge:', e instanceof Error ? e.message : e);
		return null;
	}
}
