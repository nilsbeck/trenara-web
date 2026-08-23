import { describe, it, expect } from 'vitest';
import type { NewsItem } from '$lib/server/trenara/types';
import {
	STALE_AFTER_DAYS,
	formatUnread,
	isNewer,
	isUnread,
	markOf,
	newestOf,
	summarizeUnread
} from './news-unread';

const NOW = 1_750_000_000;
const DAY = 86400;

function item(id: number, createdAt: number): NewsItem {
	return {
		id,
		title: `Item ${id}`,
		content: 'body',
		video_url: null,
		created_at: createdAt,
		attachment: null
	};
}

/** A page of items, newest first, one day apart — the shape the API returns. */
function page(count: number, from = NOW - DAY): NewsItem[] {
	return Array.from({ length: count }, (_, i) => item(100 - i, from - i * DAY));
}

describe('isNewer', () => {
	it('orders on created_at', () => {
		expect(isNewer({ id: 1, createdAt: 20 }, { id: 99, createdAt: 10 })).toBe(true);
		expect(isNewer({ id: 99, createdAt: 10 }, { id: 1, createdAt: 20 })).toBe(false);
	});

	it('breaks a same-second tie on id', () => {
		expect(isNewer({ id: 2, createdAt: 10 }, { id: 1, createdAt: 10 })).toBe(true);
		expect(isNewer({ id: 1, createdAt: 10 }, { id: 2, createdAt: 10 })).toBe(false);
	});

	it('is not newer than itself', () => {
		expect(isNewer({ id: 1, createdAt: 10 }, { id: 1, createdAt: 10 })).toBe(false);
	});
});

describe('newestOf', () => {
	it('returns null for an empty page', () => {
		expect(newestOf([])).toBeNull();
	});

	it('picks the newest regardless of order', () => {
		expect(newestOf([item(1, 10), item(2, 30), item(3, 20)])).toEqual({ id: 2, createdAt: 30 });
	});
});

describe('isUnread', () => {
	it('is false without a mark — a new reader has no backlog', () => {
		expect(isUnread(item(1, NOW), null, NOW)).toBe(false);
	});

	it('is true for an item newer than the mark', () => {
		expect(isUnread(item(5, NOW - DAY), { id: 4, createdAt: NOW - 2 * DAY }, NOW)).toBe(true);
	});

	it('is false for the marked item itself', () => {
		const seen = item(5, NOW - DAY);
		expect(isUnread(seen, markOf(seen), NOW)).toBe(false);
	});

	it('is false once an unopened item goes stale', () => {
		const old = item(5, NOW - (STALE_AFTER_DAYS + 1) * DAY);
		expect(isUnread(old, { id: 1, createdAt: 0 }, NOW)).toBe(false);
	});

	it('still counts an item just inside the staleness window', () => {
		const recent = item(5, NOW - (STALE_AFTER_DAYS - 1) * DAY);
		expect(isUnread(recent, { id: 1, createdAt: 0 }, NOW)).toBe(true);
	});
});

describe('summarizeUnread', () => {
	it('reports nothing for an unmarked reader, however much news exists', () => {
		expect(summarizeUnread(page(10), null, NOW, true)).toEqual({ count: 0, capped: false });
	});

	it('counts only what arrived after the mark', () => {
		const items = page(5);
		const summary = summarizeUnread(items, markOf(items[2]), NOW);
		expect(summary).toEqual({ count: 2, capped: false });
	});

	it('caps a full page when older pages exist', () => {
		const items = page(10);
		expect(summarizeUnread(items, { id: 1, createdAt: NOW - 20 * DAY }, NOW, true)).toEqual({
			count: 10,
			capped: true
		});
	});

	it('does not cap a full page that is the only page', () => {
		const items = page(10);
		expect(summarizeUnread(items, { id: 1, createdAt: NOW - 20 * DAY }, NOW, false).capped).toBe(
			false
		);
	});

	it('does not cap a partly read page', () => {
		const items = page(10);
		expect(summarizeUnread(items, markOf(items[1]), NOW, true).capped).toBe(false);
	});

	it('ignores stale items when counting', () => {
		const items = [item(3, NOW - DAY), item(2, NOW - (STALE_AFTER_DAYS + 5) * DAY)];
		expect(summarizeUnread(items, { id: 1, createdAt: 0 }, NOW).count).toBe(1);
	});

	it('reports nothing for an empty feed', () => {
		expect(summarizeUnread([], { id: 1, createdAt: 0 }, NOW, true)).toEqual({
			count: 0,
			capped: false
		});
	});
});

describe('formatUnread', () => {
	it('is empty when there is nothing unread', () => {
		expect(formatUnread({ count: 0, capped: false })).toBe('');
	});

	it('shows the count', () => {
		expect(formatUnread({ count: 3, capped: false })).toBe('3');
	});

	it('marks a capped count as a floor', () => {
		expect(formatUnread({ count: 10, capped: true })).toBe('10+');
	});
});
