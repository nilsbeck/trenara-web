import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Cookies } from '@sveltejs/kit';
import { TokenType } from '$lib/server/auth/types';
import { cachedRead, CacheKey, invalidate, readCacheSize, resetReadCache } from './read-cache';

beforeEach(() => {
	resetReadCache();
	vi.useRealTimers();
});

function cookiesFor(token: string | undefined): Cookies {
	return {
		get: (name: string) => (name === TokenType.AccessToken ? token : undefined)
	} as unknown as Cookies;
}

const alice = cookiesFor('alice-token');
const bob = cookiesFor('bob-token');

describe('serving a read twice', () => {
	it('asks Trenara once and serves the second from memory', async () => {
		const read = vi.fn().mockResolvedValue({ week: 1 });

		expect(await cachedRead(alice, CacheKey.week(100), read)).toEqual({ week: 1 });
		expect(await cachedRead(alice, CacheKey.week(100), read)).toEqual({ week: 1 });

		expect(read).toHaveBeenCalledTimes(1);
	});

	// The report that prompted this showed every endpoint doubled inside ten
	// seconds — two page loads racing. Holding the promise rather than the
	// answer collapses that pair into one request.
	it('joins a request already in flight rather than opening a second', async () => {
		let settle: (value: unknown) => void = () => {};
		const read = vi.fn().mockReturnValue(new Promise((resolve) => (settle = resolve)));

		const first = cachedRead(alice, CacheKey.week(100), read);
		const second = cachedRead(alice, CacheKey.week(100), read);
		settle({ week: 1 });

		expect(await first).toEqual({ week: 1 });
		expect(await second).toEqual({ week: 1 });
		expect(read).toHaveBeenCalledTimes(1);
	});

	it('treats different weeks as different reads', async () => {
		const read = vi.fn().mockResolvedValue({});

		await cachedRead(alice, CacheKey.week(100), read);
		await cachedRead(alice, CacheKey.week(200), read);

		expect(read).toHaveBeenCalledTimes(2);
	});

	it('asks again once the entry has aged out', async () => {
		const read = vi.fn().mockResolvedValue({});

		await cachedRead(alice, CacheKey.week(100), read, { ttl: 20 });
		await new Promise((r) => setTimeout(r, 40));
		await cachedRead(alice, CacheKey.week(100), read, { ttl: 20 });

		expect(read).toHaveBeenCalledTimes(2);
	});
});

// The one mistake here that would be worse than the rate limiting: two runners
// sharing an entry means one is shown the other's training plan.
describe('keeping runners apart', () => {
	it('never serves one runner a read taken for another', async () => {
		const aliceRead = vi.fn().mockResolvedValue({ owner: 'alice' });
		const bobRead = vi.fn().mockResolvedValue({ owner: 'bob' });

		expect(await cachedRead(alice, CacheKey.week(100), aliceRead)).toEqual({ owner: 'alice' });
		expect(await cachedRead(bob, CacheKey.week(100), bobRead)).toEqual({ owner: 'bob' });

		expect(aliceRead).toHaveBeenCalledTimes(1);
		expect(bobRead).toHaveBeenCalledTimes(1);
	});

	// Without a token there is no per-user key, and a shared one would be
	// exactly the leak above.
	it('caches nothing at all when there is no token to key on', async () => {
		const read = vi.fn().mockResolvedValue({});
		const anonymous = cookiesFor(undefined);

		await cachedRead(anonymous, CacheKey.week(100), read);
		await cachedRead(anonymous, CacheKey.week(100), read);

		expect(read).toHaveBeenCalledTimes(2);
		expect(readCacheSize()).toBe(0);
	});
});

describe('fresh', () => {
	// The refresh button is pressed by someone who thinks what they are looking
	// at is wrong. Serving them the copy they are complaining about is no answer.
	it('goes to Trenara even with a warm entry', async () => {
		const read = vi.fn().mockResolvedValue({});

		await cachedRead(alice, CacheKey.week(100), read);
		await cachedRead(alice, CacheKey.week(100), read, { fresh: true });

		expect(read).toHaveBeenCalledTimes(2);
	});

	it('leaves its own answer behind, so the next read is spared', async () => {
		const read = vi.fn().mockResolvedValue({});

		await cachedRead(alice, CacheKey.week(100), read, { fresh: true });
		await cachedRead(alice, CacheKey.week(100), read);

		expect(read).toHaveBeenCalledTimes(1);
	});
});

describe('invalidation', () => {
	it('drops a runner’s weeks after a write', async () => {
		const read = vi.fn().mockResolvedValue({});

		await cachedRead(alice, CacheKey.week(100), read);
		invalidate(alice, CacheKey.weeks);
		await cachedRead(alice, CacheKey.week(100), read);

		expect(read).toHaveBeenCalledTimes(2);
	});

	// A write that moves a session has nothing to do with who is signed in.
	it('leaves other kinds of read alone when a prefix is given', async () => {
		const read = vi.fn().mockResolvedValue({});

		await cachedRead(alice, CacheKey.currentUser, read);
		await cachedRead(alice, CacheKey.week(100), read);
		invalidate(alice, CacheKey.weeks);
		await cachedRead(alice, CacheKey.currentUser, read);

		expect(read).toHaveBeenCalledTimes(2);
	});

	it('does not drop another runner’s reads', async () => {
		const read = vi.fn().mockResolvedValue({});

		await cachedRead(bob, CacheKey.week(100), read);
		invalidate(alice, CacheKey.weeks);
		await cachedRead(bob, CacheKey.week(100), read);

		expect(read).toHaveBeenCalledTimes(1);
	});
});

describe('a read that failed', () => {
	// Remembering a rejection would hand the same failure to every caller for
	// the rest of the minute — a blip turned into an outage.
	it('is not remembered, so the next caller tries again', async () => {
		const read = vi
			.fn()
			.mockRejectedValueOnce(new Error('upstream down'))
			.mockResolvedValueOnce({ week: 1 });

		await expect(cachedRead(alice, CacheKey.week(100), read)).rejects.toThrow('upstream down');
		expect(await cachedRead(alice, CacheKey.week(100), read)).toEqual({ week: 1 });
		expect(read).toHaveBeenCalledTimes(2);
	});

	it('leaves nothing behind in the map', async () => {
		const read = vi.fn().mockRejectedValue(new Error('upstream down'));

		await expect(cachedRead(alice, CacheKey.week(100), read)).rejects.toThrow();
		// The rejection handler runs on the microtask queue.
		await Promise.resolve();

		expect(readCacheSize()).toBe(0);
	});
});
