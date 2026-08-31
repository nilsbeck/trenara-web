import { describe, it, expect } from 'vitest';
import { ratedEntry } from './rated-entry';

describe('ratedEntry', () => {
	it('takes the entry the server rated', () => {
		const body = { id: 29626510, rpe: 2, ask_feedback: false };
		expect(ratedEntry(body, 29626510)).toBe(body);
	});

	it('refuses an entry that is not the one rated', () => {
		// Two ratings in flight, or a proxy answering with something else's
		// body: swapping this into the week would overwrite the wrong session.
		expect(ratedEntry({ id: 29626511, rpe: 2 }, 29626510)).toBeNull();
	});

	it('refuses a body that carries no rating', () => {
		expect(ratedEntry({ id: 29626510, rpe: null }, 29626510)).toBeNull();
		expect(ratedEntry({ id: 29626510 }, 29626510)).toBeNull();
	});

	it('refuses anything that is not an object', () => {
		// A 204 read as an empty body, and an error envelope that parsed.
		expect(ratedEntry(null, 29626510)).toBeNull();
		expect(ratedEntry('', 29626510)).toBeNull();
		expect(ratedEntry([{ id: 29626510, rpe: 2 }], 29626510)).toBeNull();
	});
});
