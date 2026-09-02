import { describe, it, expect } from 'vitest';
import { pauseBefore, readRateLimit, retryAfterMs, windowsNeeded, RESERVE } from './budget';
import type { HeaderBag } from './budget';

/** A stand-in for `Headers`, case-insensitive as the real one is. */
function headers(values: Record<string, string>): HeaderBag {
	const lower = Object.fromEntries(
		Object.entries(values).map(([key, value]) => [key.toLowerCase(), value])
	);
	return { get: (name: string) => lower[name.toLowerCase()] ?? null };
}

describe('readRateLimit', () => {
	it('reads the budget off an ordinary response, not just a refusal', () => {
		const limit = readRateLimit(
			headers({
				'x-ratelimit-limit': '60',
				'x-ratelimit-remaining': '47',
				'x-ratelimit-reset': '1788042395'
			})
		);
		expect(limit).toEqual({ limit: 60, remaining: 47, reset: 1788042395 });
	});

	it('answers null when the headers are absent, rather than reading it as spent', () => {
		expect(readRateLimit(headers({}))).toBeNull();
	});

	it('answers null when only some of the three arrived', () => {
		expect(readRateLimit(headers({ 'x-ratelimit-remaining': '0' }))).toBeNull();
	});

	it('rejects a value that is not a whole non-negative count', () => {
		const bag = headers({
			'x-ratelimit-limit': '60',
			'x-ratelimit-remaining': 'unknown',
			'x-ratelimit-reset': '1788042395'
		});
		expect(readRateLimit(bag)).toBeNull();
	});

	it('reads a remaining of zero as zero, which is a real value', () => {
		const limit = readRateLimit(
			headers({
				'x-ratelimit-limit': '60',
				'x-ratelimit-remaining': '0',
				'x-ratelimit-reset': '1788042395'
			})
		);
		expect(limit?.remaining).toBe(0);
	});
});

describe('pauseBefore', () => {
	const now = 1_788_042_000_000; // ms
	const reset = 1_788_042_060; // seconds, one minute later

	it('does not pace at all while the window has room', () => {
		expect(pauseBefore({ limit: 60, remaining: 47, reset }, now)).toBe(0);
	});

	it('waits out the whole remainder of the window once the reserve is reached', () => {
		expect(pauseBefore({ limit: 60, remaining: RESERVE, reset }, now)).toBe(60_000);
	});

	it('waits when the budget is spent outright', () => {
		expect(pauseBefore({ limit: 60, remaining: 0, reset }, now)).toBe(60_000);
	});

	it('keeps the reserve unspent rather than draining to zero', () => {
		// The app shares this budget, and the count in hand is a response behind.
		expect(pauseBefore({ limit: 60, remaining: RESERVE + 1, reset }, now)).toBe(0);
		expect(pauseBefore({ limit: 60, remaining: RESERVE, reset }, now)).toBeGreaterThan(0);
	});

	it('honours an explicit reserve', () => {
		expect(pauseBefore({ limit: 60, remaining: 5, reset }, now, 10)).toBe(60_000);
		expect(pauseBefore({ limit: 60, remaining: 5, reset }, now, 2)).toBe(0);
	});

	it('does not wait on a reset already in the past, whose count is stale', () => {
		expect(pauseBefore({ limit: 60, remaining: 0, reset: 1_788_041_000 }, now)).toBe(0);
	});

	it('does not pace when no budget was reported', () => {
		expect(pauseBefore(null, now)).toBe(0);
	});
});

describe('retryAfterMs', () => {
	const now = 1_788_042_000_000;

	it('prefers retry-after, the header that exists to answer this', () => {
		expect(retryAfterMs(headers({ 'retry-after': '47' }), now)).toBe(47_000);
	});

	it('falls back to the reset second, which agrees with it on this API', () => {
		expect(retryAfterMs(headers({ 'x-ratelimit-reset': '1788042047' }), now)).toBe(47_000);
	});

	it('never returns a negative wait from a reset in the past', () => {
		expect(retryAfterMs(headers({ 'x-ratelimit-reset': '1788041000' }), now)).toBe(0);
	});

	it('assumes a whole window when a refusal carries neither header', () => {
		expect(retryAfterMs(headers({}), now)).toBe(60_000);
	});
});

describe('windowsNeeded', () => {
	it('is one for the run this script is usually asked for', () => {
		// Three months is fourteen weeks plus the goal.
		expect(windowsNeeded(15)).toBe(1);
	});

	it('is one for a whole year, which is 53 weeks', () => {
		expect(windowsNeeded(54)).toBe(1);
	});

	it('grows once a run cannot fit in a single window', () => {
		expect(windowsNeeded(60)).toBe(2);
		expect(windowsNeeded(261)).toBe(5);
	});

	it('never claims a run needs no windows at all', () => {
		expect(windowsNeeded(1)).toBe(1);
	});
});
