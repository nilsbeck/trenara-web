import { describe, it, expect } from 'vitest';
import { formatDateString, getMonthTimestamps } from './date';

// ─────────────────────────────────────────────────────────────
// formatDateString
// ─────────────────────────────────────────────────────────────
describe('formatDateString', () => {
	it('pads single-digit month (month param is 0-based)', () => {
		// month=0 → "01"
		expect(formatDateString(2025, 0, 5)).toBe('2025-01-05');
	});

	it('pads single-digit day', () => {
		expect(formatDateString(2025, 2, 7)).toBe('2025-03-07');
	});

	it('does not pad two-digit month', () => {
		expect(formatDateString(2025, 11, 1)).toBe('2025-12-01');
	});

	it('does not pad two-digit day', () => {
		expect(formatDateString(2025, 5, 30)).toBe('2025-06-30');
	});

	it('handles year 2000', () => {
		expect(formatDateString(2000, 0, 1)).toBe('2000-01-01');
	});

	it('handles leap-year February 29', () => {
		expect(formatDateString(2024, 1, 29)).toBe('2024-02-29');
	});
});

// ─────────────────────────────────────────────────────────────
// getMonthTimestamps
// ─────────────────────────────────────────────────────────────
describe('getMonthTimestamps', () => {
	it('returns at least one timestamp for any month', () => {
		const stamps = getMonthTimestamps(new Date(2025, 2, 1)); // March 2025
		expect(stamps.length).toBeGreaterThanOrEqual(1);
	});

	it('first timestamp is always the 1st of the month', () => {
		const date = new Date(2025, 2, 1); // March 2025
		const stamps = getMonthTimestamps(date);
		expect(stamps[0].getDate()).toBe(1);
		expect(stamps[0].getMonth()).toBe(2);
		expect(stamps[0].getFullYear()).toBe(2025);
	});

	it('subsequent timestamps are Mondays (day=1)', () => {
		const stamps = getMonthTimestamps(new Date(2025, 2, 1)); // March 2025
		for (let i = 1; i < stamps.length; i++) {
			expect(stamps[i].getDay(), `timestamp[${i}] should be Monday`).toBe(1);
		}
	});

	it('timestamps are spaced 7 days apart after the first', () => {
		const stamps = getMonthTimestamps(new Date(2025, 2, 1));
		for (let i = 2; i < stamps.length; i++) {
			// Use Math.round to absorb a ±1 hour DST shift (raw diff may be
			// 6.958... or 7.041... days across a daylight-saving boundary).
			const diffDays = Math.round(
				(stamps[i].getTime() - stamps[i - 1].getTime()) / (1000 * 60 * 60 * 24)
			);
			expect(diffDays).toBe(7);
		}
	});

	it('works for month starting on Sunday (e.g. June 2025)', () => {
		// June 1, 2025 is a Sunday
		const stamps = getMonthTimestamps(new Date(2025, 5, 1));
		expect(stamps.length).toBeGreaterThanOrEqual(1);
		expect(stamps[0].getDate()).toBe(1);
	});

	it('works for month starting on Monday (e.g. September 2025)', () => {
		// September 1, 2025 is a Monday
		const stamps = getMonthTimestamps(new Date(2025, 8, 1));
		expect(stamps.length).toBeGreaterThanOrEqual(1);
		expect(stamps[0].getDate()).toBe(1);
	});

	it('returns unique Date instances (not the same reference)', () => {
		const stamps = getMonthTimestamps(new Date(2025, 2, 1));
		const times = stamps.map((s) => s.getTime());
		const unique = new Set(times);
		expect(unique.size).toBe(stamps.length);
	});

	it('a 5-week month has 5 timestamps', () => {
		// March 2025: 31 days, first day Saturday → needs 5 weeks
		const stamps = getMonthTimestamps(new Date(2025, 2, 1));
		expect(stamps.length).toBeGreaterThanOrEqual(5);
	});
});
