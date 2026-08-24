import { describe, it, expect } from 'vitest';
import { fingerprint } from './fingerprint';

describe('fingerprint', () => {
	it('is stable for the same value', () => {
		const value = { trainings: [{ id: 1, title: 'Easy run' }] };
		expect(fingerprint(value)).toBe(fingerprint({ trainings: [{ id: 1, title: 'Easy run' }] }));
	});

	it('changes when a nested field changes', () => {
		const before = fingerprint({ trainings: [{ id: 1, day_long: '2025-03-05' }] });
		const after = fingerprint({ trainings: [{ id: 1, day_long: '2025-03-06' }] });
		expect(after).not.toBe(before);
	});

	it('changes when a training is added', () => {
		const before = fingerprint({ trainings: [{ id: 1 }] });
		const after = fingerprint({ trainings: [{ id: 1 }, { id: 2 }] });
		expect(after).not.toBe(before);
	});

	it('hashes strings without re-encoding them', () => {
		const value = { a: 1 };
		expect(fingerprint(JSON.stringify(value))).toBe(fingerprint(value));
	});

	it('handles null and undefined without throwing', () => {
		expect(fingerprint(null)).toBe(fingerprint(undefined));
		expect(typeof fingerprint(null)).toBe('string');
	});

	it('produces a short token', () => {
		const long = fingerprint({ blob: 'x'.repeat(50_000) });
		expect(long.length).toBeLessThan(16);
	});
});
