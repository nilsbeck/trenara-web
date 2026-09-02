import { describe, it, expect } from 'vitest';
import { requireDate, todayKey, toUnixSeconds, weekAnchors } from './range';

describe('weekAnchors', () => {
	it('starts at the Monday of the week containing from', () => {
		// 2026-09-02 is a Wednesday; its week starts on the 31st of August.
		const anchors = weekAnchors(new Date(2026, 8, 2), new Date(2026, 8, 2));
		expect(anchors).toHaveLength(1);
		expect(anchors[0].getDay()).toBe(1);
		expect(anchors[0].toDateString()).toBe(new Date(2026, 7, 31).toDateString());
	});

	it('covers the week containing to, even when to is mid-week', () => {
		// 2026-12-06 is a Sunday, so its Monday is the 30th of November.
		const anchors = weekAnchors(new Date(2026, 8, 2), new Date(2026, 11, 6));
		const last = anchors[anchors.length - 1];
		expect(last.toDateString()).toBe(new Date(2026, 10, 30).toDateString());
	});

	it('spaces every anchor exactly seven days apart', () => {
		const anchors = weekAnchors(new Date(2026, 8, 2), new Date(2026, 11, 6));
		for (let i = 1; i < anchors.length; i++) {
			const gap = anchors[i].getTime() - anchors[i - 1].getTime();
			// Days rather than milliseconds: a DST change makes one of these
			// weeks 23 or 25 hours long, and the anchor is still the Monday.
			expect(Math.round(gap / 86_400_000)).toBe(7);
			expect(anchors[i].getDay()).toBe(1);
		}
	});

	it('returns nothing for an inverted range rather than looping', () => {
		expect(weekAnchors(new Date(2026, 11, 6), new Date(2026, 8, 2))).toEqual([]);
	});

	it('caps a range wide enough to be a typo', () => {
		const anchors = weekAnchors(new Date(2000, 0, 1), new Date(2026, 0, 1));
		expect(anchors).toHaveLength(260);
	});

	it('handles a from that is already a Monday', () => {
		const monday = new Date(2026, 8, 7);
		expect(weekAnchors(monday, monday)[0].toDateString()).toBe(monday.toDateString());
	});

	it('handles a from that is a Sunday, which belongs to the week before', () => {
		const anchors = weekAnchors(new Date(2026, 8, 6), new Date(2026, 8, 6));
		expect(anchors[0].toDateString()).toBe(new Date(2026, 7, 31).toDateString());
	});
});

describe('toUnixSeconds', () => {
	it('is whole seconds, not milliseconds', () => {
		const date = new Date(2026, 8, 2, 0, 0, 0, 789);
		expect(toUnixSeconds(date)).toBe(Math.floor(date.getTime() / 1000));
		expect(Number.isInteger(toUnixSeconds(date))).toBe(true);
	});
});

describe('requireDate', () => {
	it('parses a YYYY-MM-DD to local midnight', () => {
		const parsed = requireDate('2026-12-06', '--to');
		expect(parsed.getFullYear()).toBe(2026);
		expect(parsed.getMonth()).toBe(11);
		expect(parsed.getDate()).toBe(6);
		expect(parsed.getHours()).toBe(0);
	});

	it('throws with the flag name on anything else', () => {
		expect(() => requireDate('06-12-2026', '--to')).toThrow('--to');
		expect(() => requireDate('tomorrow', '--from')).toThrow('--from');
	});

	it('throws on a date that does not exist rather than rolling it forward', () => {
		expect(() => requireDate('2026-02-31', '--from')).toThrow();
	});
});

describe('todayKey', () => {
	it('is the local day, not the UTC one', () => {
		expect(todayKey(new Date(2026, 11, 6, 23, 30))).toBe('2026-12-06');
	});
});
