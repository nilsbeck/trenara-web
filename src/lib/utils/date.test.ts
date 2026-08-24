import { describe, it, expect } from 'vitest';
import {
	formatDateString,
	getMonthTimestamps,
	mondayOf,
	parseLocalDateString,
	toLocalDateString,
	weeksStillOpen
} from './date';

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

// ─────────────────────────────────────────────────────────────
// toLocalDateString / parseLocalDateString
// ─────────────────────────────────────────────────────────────
describe('toLocalDateString', () => {
	it('reads the local day, not the UTC one', () => {
		expect(toLocalDateString(new Date(2025, 2, 5, 23, 30))).toBe('2025-03-05');
	});

	it('pads month and day', () => {
		expect(toLocalDateString(new Date(2025, 0, 7))).toBe('2025-01-07');
	});
});

describe('parseLocalDateString', () => {
	it('round-trips with toLocalDateString', () => {
		const parsed = parseLocalDateString('2025-03-05');
		expect(parsed && toLocalDateString(parsed)).toBe('2025-03-05');
	});

	it('lands on local midnight', () => {
		const parsed = parseLocalDateString('2025-03-05');
		expect(parsed?.getHours()).toBe(0);
		expect(parsed?.getMinutes()).toBe(0);
	});

	it('rejects a malformed string', () => {
		expect(parseLocalDateString('5.3.2025')).toBeNull();
		expect(parseLocalDateString('2025-3-5')).toBeNull();
		expect(parseLocalDateString('')).toBeNull();
	});

	it('rejects a day that does not exist rather than rolling it over', () => {
		expect(parseLocalDateString('2025-02-31')).toBeNull();
		expect(parseLocalDateString('2025-13-01')).toBeNull();
	});

	it('accepts a leap day', () => {
		expect(parseLocalDateString('2024-02-29')).not.toBeNull();
	});
});

// ─────────────────────────────────────────────────────────────
// mondayOf
// ─────────────────────────────────────────────────────────────
describe('mondayOf', () => {
	it('leaves a Monday where it is', () => {
		expect(toLocalDateString(mondayOf(new Date(2025, 2, 3)))).toBe('2025-03-03');
	});

	it('walks a midweek day back', () => {
		expect(toLocalDateString(mondayOf(new Date(2025, 2, 6)))).toBe('2025-03-03');
	});

	it('treats Sunday as the end of its week, not the start of the next', () => {
		expect(toLocalDateString(mondayOf(new Date(2025, 2, 9)))).toBe('2025-03-03');
	});

	it('crosses a month boundary backwards', () => {
		// 1 March 2025 is a Saturday.
		expect(toLocalDateString(mondayOf(new Date(2025, 2, 1)))).toBe('2025-02-24');
	});

	it('drops the time of day', () => {
		expect(mondayOf(new Date(2025, 2, 6, 18, 45)).getHours()).toBe(0);
	});
});

// ─────────────────────────────────────────────────────────────
// weeksStillOpen
// ─────────────────────────────────────────────────────────────
describe('weeksStillOpen', () => {
	// March 2025 starts on a Saturday, so its grid runs 24 Feb – 6 Apr.
	const march = getMonthTimestamps(new Date(2025, 2, 15));

	it('keeps every week when the month has not started', () => {
		const open = weeksStillOpen(march, new Date(2025, 1, 1));
		expect(open.anchors).toHaveLength(march.length);
		expect(open.coveredFrom).toBe('2025-02-24');
	});

	it('drops the weeks that are over by the end of the month', () => {
		const open = weeksStillOpen(march, new Date(2025, 2, 25));
		expect(open.anchors.length).toBeLessThan(march.length);
		expect(open.coveredFrom).toBe('2025-03-24');
	});

	it('keeps the week the cutoff falls in', () => {
		// Wednesday 26 March: its week runs 24–30 March and is not over.
		const open = weeksStillOpen(march, new Date(2025, 2, 26));
		expect(open.coveredFrom).toBe('2025-03-24');
	});

	it('lets go of a week the day after it ends', () => {
		// Monday 10 March: the 3–9 March week is finished.
		const open = weeksStillOpen(march, new Date(2025, 2, 10));
		expect(open.coveredFrom).toBe('2025-03-10');
	});

	it('returns nothing for a month wholly in the past', () => {
		const open = weeksStillOpen(march, new Date(2025, 5, 1));
		expect(open.anchors).toHaveLength(0);
		expect(open.coveredFrom).toBeNull();
	});

	it('ignores the time of day on the cutoff', () => {
		const early = weeksStillOpen(march, new Date(2025, 2, 10, 0, 1));
		const late = weeksStillOpen(march, new Date(2025, 2, 10, 23, 59));
		expect(late.coveredFrom).toBe(early.coveredFrom);
		expect(late.anchors).toHaveLength(early.anchors.length);
	});

	it('covers every day of the month between the kept weeks and the cutoff', () => {
		// Whatever it keeps must start no later than the week the cutoff is in,
		// so nothing between coveredFrom and today goes unasked-for.
		for (let day = 1; day <= 31; day++) {
			const cutoff = new Date(2025, 2, day);
			const open = weeksStillOpen(march, cutoff);
			if (!open.coveredFrom) continue;
			expect(open.coveredFrom <= toLocalDateString(mondayOf(cutoff))).toBe(true);
		}
	});
});
