import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Entry, Schedule } from '$lib/server/trenara/types';

vi.mock('$app/environment', () => ({ browser: true }));

import {
	UNCONFIRMED_TTL_MS,
	forgetRating,
	rememberRating,
	withRememberedRatings
} from './remembered-ratings';

function entry(id: number, rpe: number | null): Entry {
	return { id, rpe, type: 'run', start_time: '2026-08-26T07:00:00+02:00' } as Entry;
}

function schedule(...entries: Entry[]): Schedule {
	return { entries } as Schedule;
}

beforeEach(() => {
	window.localStorage.clear();
});

describe('withRememberedRatings', () => {
	it('reads a sent rating over an entry the week still says is unrated', () => {
		rememberRating(29442588, 7);

		const next = withRememberedRatings(schedule(entry(29442588, null)));

		expect(next.entries[0].rpe).toBe(7);
	});

	it('leaves a schedule it has nothing to add to alone', () => {
		const before = schedule(entry(1, null));

		expect(withRememberedRatings(before)).toBe(before);
	});

	it('does not touch entries it holds nothing for', () => {
		rememberRating(1, 7);

		const next = withRememberedRatings(schedule(entry(1, null), entry(2, null)));

		expect(next.entries[1].rpe).toBeNull();
	});

	it('defers to the week payload once it carries a rating of its own', () => {
		rememberRating(1, 7);

		const next = withRememberedRatings(schedule(entry(1, 4)));

		expect(next.entries[0].rpe).toBe(4);
	});

	it('stops holding a rating the week payload has caught up with', () => {
		rememberRating(1, 7);
		withRememberedRatings(schedule(entry(1, 7)));

		// The entry going back to unrated is now the week's business, not ours.
		const later = withRememberedRatings(schedule(entry(1, null)));
		expect(later.entries[0].rpe).toBeNull();
	});

	// The safety valve: a rating Trenara took and dropped must not be hidden
	// here for good, or nothing will ever ask for it again.
	it('lets go of a rating the week never caught up with', () => {
		const sent = Date.now();
		rememberRating(1, 7, sent);

		const next = withRememberedRatings(schedule(entry(1, null)), sent + UNCONFIRMED_TTL_MS);

		expect(next.entries[0].rpe).toBeNull();
	});

	it('holds one right up to the deadline', () => {
		const sent = Date.now();
		rememberRating(1, 7, sent);

		const next = withRememberedRatings(schedule(entry(1, null)), sent + UNCONFIRMED_TTL_MS - 1);

		expect(next.entries[0].rpe).toBe(7);
	});

	it('survives being written and read across page loads', () => {
		rememberRating(1, 7);

		expect(window.localStorage.getItem('trenara:unconfirmed-rpe')).toContain('7');
		expect(withRememberedRatings(schedule(entry(1, null))).entries[0].rpe).toBe(7);
	});

	it('shrugs off a storage slot holding something else', () => {
		window.localStorage.setItem('trenara:unconfirmed-rpe', 'not json');

		const before = schedule(entry(1, null));
		expect(withRememberedRatings(before)).toBe(before);
	});

	it('ignores a malformed record', () => {
		window.localStorage.setItem(
			'trenara:unconfirmed-rpe',
			JSON.stringify({ '1': { rpe: 'high' } })
		);

		const before = schedule(entry(1, null));
		expect(withRememberedRatings(before)).toBe(before);
	});

	it('copes with a schedule carrying no entries', () => {
		rememberRating(1, 7);

		expect(() => withRememberedRatings({} as Schedule)).not.toThrow();
	});
});

describe('forgetRating', () => {
	it('drops a rating that was refused', () => {
		rememberRating(1, 7);
		forgetRating(1);

		expect(withRememberedRatings(schedule(entry(1, null))).entries[0].rpe).toBeNull();
	});

	it('leaves the others in place', () => {
		rememberRating(1, 7);
		rememberRating(2, 4);
		forgetRating(1);

		expect(withRememberedRatings(schedule(entry(2, null))).entries[0].rpe).toBe(4);
	});

	it('clears the slot once nothing is held', () => {
		rememberRating(1, 7);
		forgetRating(1);

		expect(window.localStorage.getItem('trenara:unconfirmed-rpe')).toBeNull();
	});
});
