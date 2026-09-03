import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Entry } from '$lib/server/trenara/types';
import { rememberRating, reconcileRatedEntries, resetRatedLocally } from './rated-locally';

function entry(id: number, rpe: number | null): Entry {
	return { id, rpe } as Entry;
}

describe('rated-locally', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-08-26T09:00:00Z'));
	});

	afterEach(() => {
		resetRatedLocally();
		vi.useRealTimers();
	});

	it('patches a remembered rating back onto a still-unrated entry', () => {
		rememberRating(900, 6);

		const patched = reconcileRatedEntries([entry(900, null)]);

		expect(patched[0].rpe).toBe(6);
		expect(patched[0].ask_feedback).toBe(false);
	});

	it('returns the same array when nothing is remembered', () => {
		const entries = [entry(900, null)];
		expect(reconcileRatedEntries(entries)).toBe(entries);
	});

	it('returns the same array when every entry already carries its own rating', () => {
		rememberRating(900, 6);
		const entries = [entry(900, 4)];

		// The server's own answer, whatever it says, is trusted over a stale
		// local guess once the entry itself is no longer unrated.
		expect(reconcileRatedEntries(entries)).toBe(entries);
	});

	it('leaves an entry alone when nothing was remembered for it', () => {
		rememberRating(900, 6);
		const other = entry(901, null);

		expect(reconcileRatedEntries([other])[0]).toBe(other);
	});

	it('stops trusting a remembered rating once it is older than the TTL', () => {
		rememberRating(900, 6);

		vi.setSystemTime(new Date('2026-08-26T09:06:00Z')); // six minutes on

		const entries = [entry(900, null)];
		expect(reconcileRatedEntries(entries)).toBe(entries);
	});

	it('is cleared by resetRatedLocally', () => {
		rememberRating(900, 6);
		resetRatedLocally();

		expect(reconcileRatedEntries([entry(900, null)])[0].rpe).toBeNull();
	});
});
