import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Cookies } from '@sveltejs/kit';
import type { NewsItem } from '$lib/server/trenara/types';
import { clearAllBadgeCache, clearBadgeCache, loadNewsBadge } from './badge';

const { getNews, getMark, advanceMark } = vi.hoisted(() => ({
	getNews: vi.fn(),
	getMark: vi.fn(),
	advanceMark: vi.fn()
}));

vi.mock('$lib/server/trenara', () => ({ newsApi: { getNews } }));
vi.mock('$lib/server/db/news-read-state', () => ({
	newsReadStateDAO: { getMark, advanceMark }
}));

const cookies = {} as Cookies;
const DAY = 86400;

function item(id: number, ageInDays: number): NewsItem {
	return {
		id,
		title: `Item ${id}`,
		content: 'body',
		video_url: null,
		created_at: Math.floor(Date.now() / 1000) - ageInDays * DAY,
		attachment: null
	};
}

function envelope(items: NewsItem[], totalPages = 1) {
	return {
		data: items,
		pagination: {
			total: items.length,
			count: items.length,
			per_page: 10,
			current_page: 1,
			total_pages: totalPages,
			links: {}
		}
	};
}

beforeEach(() => {
	vi.clearAllMocks();
	clearAllBadgeCache();
	advanceMark.mockResolvedValue({ advanced: true });
	vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('loadNewsBadge', () => {
	it('seeds a first-time reader to the newest item and badges nothing', async () => {
		getNews.mockResolvedValue(envelope([item(82, 1), item(81, 4)]));
		getMark.mockResolvedValue(null);

		expect(await loadNewsBadge(cookies, 7)).toEqual({ count: 0, capped: false });
		expect(advanceMark).toHaveBeenCalledWith(7, expect.objectContaining({ id: 82 }));
	});

	it('does not seed off an empty feed — the next item to arrive is genuinely new', async () => {
		getNews.mockResolvedValue(envelope([]));
		getMark.mockResolvedValue(null);

		expect(await loadNewsBadge(cookies, 7)).toEqual({ count: 0, capped: false });
		expect(advanceMark).not.toHaveBeenCalled();
	});

	it('counts what arrived after the reader last looked', async () => {
		getNews.mockResolvedValue(envelope([item(82, 1), item(81, 3), item(80, 9)]));
		getMark.mockResolvedValue({ id: 80, createdAt: item(80, 9).created_at });

		expect(await loadNewsBadge(cookies, 7)).toEqual({ count: 2, capped: false });
		expect(advanceMark).not.toHaveBeenCalled();
	});

	it('caps a full first page when older pages exist', async () => {
		const items = Array.from({ length: 10 }, (_, i) => item(100 - i, i));
		getNews.mockResolvedValue(envelope(items, 3));
		getMark.mockResolvedValue({ id: 1, createdAt: 1_000_000_000 });

		expect(await loadNewsBadge(cookies, 7)).toEqual({ count: 10, capped: true });
	});

	it('stops counting an item nobody opened for a month', async () => {
		getNews.mockResolvedValue(envelope([item(82, 40), item(81, 50)]));
		getMark.mockResolvedValue({ id: 1, createdAt: 1_000_000_000 });

		expect(await loadNewsBadge(cookies, 7)).toEqual({ count: 0, capped: false });
	});

	it('serves the cached badge rather than calling upstream again', async () => {
		getNews.mockResolvedValue(envelope([item(82, 1)]));
		getMark.mockResolvedValue({ id: 1, createdAt: 1_000_000_000 });

		await loadNewsBadge(cookies, 7);
		await loadNewsBadge(cookies, 7);

		expect(getNews).toHaveBeenCalledTimes(1);
	});

	it('caches per reader', async () => {
		getNews.mockResolvedValue(envelope([item(82, 1)]));
		getMark.mockResolvedValue({ id: 1, createdAt: 1_000_000_000 });

		await loadNewsBadge(cookies, 7);
		await loadNewsBadge(cookies, 8);

		expect(getNews).toHaveBeenCalledTimes(2);
	});

	it('recomputes once the feed has been marked read', async () => {
		getNews.mockResolvedValue(envelope([item(82, 1)]));
		getMark.mockResolvedValue({ id: 1, createdAt: 1_000_000_000 });

		await loadNewsBadge(cookies, 7);
		clearBadgeCache(7);
		await loadNewsBadge(cookies, 7);

		expect(getNews).toHaveBeenCalledTimes(2);
	});

	it('shows no badge when the news feed is unreachable', async () => {
		getNews.mockRejectedValue(new Error('upstream down'));
		getMark.mockResolvedValue({ id: 1, createdAt: 1_000_000_000 });

		expect(await loadNewsBadge(cookies, 7)).toBeNull();
	});
});

describe('the cache does not grow without bound', () => {
	// The TTL alone did not bound it: an expired entry was only ever replaced or
	// explicitly cleared, nothing swept, so the map held one entry per reader who
	// had ever reached that instance for the life of the instance.
	it('forgets readers once there are more of them than it holds', async () => {
		getNews.mockResolvedValue(envelope([item(1, 1)]));
		getMark.mockResolvedValue({ id: 1, createdAt: item(1, 1).created_at });

		// Well past the 2000-reader ceiling.
		for (let userId = 1; userId <= 2400; userId++) {
			await loadNewsBadge(cookies, userId);
		}

		const callsAfterFilling = getNews.mock.calls.length;

		// The most recent reader is still held: no upstream call to answer again.
		await loadNewsBadge(cookies, 2400);
		expect(getNews.mock.calls.length).toBe(callsAfterFilling);

		// The first one was evicted, so answering for them costs a fetch.
		await loadNewsBadge(cookies, 1);
		expect(getNews.mock.calls.length).toBe(callsAfterFilling + 1);
	});

	it('sweeps entries whose time is up, rather than only replacing them', async () => {
		getNews.mockResolvedValue(envelope([item(1, 1)]));
		getMark.mockResolvedValue({ id: 1, createdAt: item(1, 1).created_at });

		vi.useFakeTimers();
		try {
			await loadNewsBadge(cookies, 7);
			const before = getNews.mock.calls.length;

			// Straight past the ten-minute TTL.
			vi.advanceTimersByTime(11 * 60 * 1000);

			// A different reader's miss is what triggers the sweep, and reader 7 is
			// no longer served from memory afterwards.
			await loadNewsBadge(cookies, 8);
			await loadNewsBadge(cookies, 7);

			expect(getNews.mock.calls.length).toBe(before + 2);
		} finally {
			vi.useRealTimers();
		}
	});
});
