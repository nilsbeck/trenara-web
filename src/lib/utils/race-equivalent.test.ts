import { describe, it, expect } from 'vitest';
import {
	impliedDistanceKm,
	equivalentSeconds,
	raceEquivalent,
	RIEGEL_EXPONENT
} from './race-equivalent';

describe('impliedDistanceKm', () => {
	it('recovers the distance a stored prediction was about', () => {
		// 1:03:12 at 04:12 per km is 15.048 km on the nose — a 15 km goal, with
		// the pace stored to the whole second.
		expect(impliedDistanceKm('01:03:12', '04:12')).toBe(15);
		expect(impliedDistanceKm('00:40:56', '04:05')).toBe(10);
		expect(impliedDistanceKm('03:11:18', '04:32')).toBe(42.195);
		expect(impliedDistanceKm('01:31:04', '04:18')).toBe(21.0975);
	});

	it('keeps a distance nobody races as the number it is', () => {
		expect(impliedDistanceKm('00:35:00', '05:00')).toBe(7);
	});

	it('holds one goal at one distance despite the stored pace rounding', () => {
		// Real rows from one goal, days apart. The pace is stored to the whole
		// second, so the same goal divides out as 41.06 one day and 41.14 the
		// next — and reading those as different distances moved the converted
		// time by six seconds for no reason at all.
		const sameGoal = [
			impliedDistanceKm('02:59:58', '04:23'),
			impliedDistanceKm('03:00:30', '04:24'),
			impliedDistanceKm('03:00:12', '04:23'),
			impliedDistanceKm('03:08:33', '04:35')
		];

		expect(new Set(sameGoal).size).toBe(1);
		expect(sameGoal[0]).toBe(41);
	});

	it('has nothing to say about a malformed pair', () => {
		expect(impliedDistanceKm('01:03:12', '00:00')).toBeNull();
		expect(impliedDistanceKm('nonsense', '04:12')).toBeNull();
	});
});

describe('equivalentSeconds', () => {
	it('is the identity over the same distance', () => {
		expect(equivalentSeconds(2456, 10, 10)).toBeCloseTo(2456, 6);
	});

	it('follows the curve the API predictions sit on', () => {
		// 10 km 40:56 -> half marathon, against the API's own 1:31:04.
		expect(equivalentSeconds(2456, 10, 21.0975)).toBeCloseTo(5464, -1);
	});
});

describe('raceEquivalent', () => {
	it('reproduces the API 10 km prediction from the goal one', () => {
		// The strongest evidence the conversion is the API's own: a 15 km
		// prediction of 1:03:12 converts to 40:56, which is exactly what the same
		// response gives for 10 km.
		const equivalent = raceEquivalent('01:03:12', '04:12');

		expect(equivalent?.fromKm).toBe(15);
		expect(Math.round(equivalent!.seconds)).toBe(2456);
	});

	it('is barely moved by the exponent', () => {
		// 1.06 against 1.08 is twenty seconds on a forty-minute value, against the
		// four and a half minutes of improvement a goal like this asks for.
		const low = raceEquivalent('01:03:12', '04:12', 10, 1.06)!;
		const high = raceEquivalent('01:03:12', '04:12', 10, 1.08)!;

		expect(Math.abs(low.seconds - high.seconds)).toBeLessThan(25);
	});

	it('carries a pace alongside the time', () => {
		const equivalent = raceEquivalent('00:40:56', '04:05')!;
		expect(equivalent.paceSeconds).toBeCloseTo(equivalent.seconds / 10, 6);
	});

	it('converts to any reference distance', () => {
		const marathon = raceEquivalent('00:40:56', '04:05', 42.195)!;
		expect(Math.round(marathon.seconds)).toBe(11478);
	});

	it('says nothing rather than guessing on a malformed row', () => {
		expect(raceEquivalent('', '')).toBeNull();
		expect(raceEquivalent('01:03:12', '0:00')).toBeNull();
	});

	it('uses the measured exponent by default', () => {
		expect(RIEGEL_EXPONENT).toBeCloseTo(1.071, 3);
	});
});

describe('a real series across a goal change', () => {
	/**
	 * Recorded either side of a switch from a 41 km goal to an 18 km one, six
	 * days apart. The raw goal-distance series is useless across that seam;
	 * converting is the whole reason the equivalent exists.
	 */
	const before = { time: '03:00:12', pace: '04:23' };
	const after = { time: '01:16:18', pace: '04:14' };

	it('turns a 58% cliff into six days of drift', () => {
		const rawDrop =
			(timeStringToSecondsLocal(before.time) - timeStringToSecondsLocal(after.time)) /
			timeStringToSecondsLocal(before.time);
		expect(rawDrop).toBeGreaterThan(0.5);

		const a = raceEquivalent(before.time, before.pace)!;
		const b = raceEquivalent(after.time, after.pace)!;

		// Within a few per cent, and in the direction six days off training would
		// take it — not a fitness cliff the runner never fell off.
		expect(Math.abs(b.seconds - a.seconds) / a.seconds).toBeLessThan(0.03);
		expect(b.seconds).toBeGreaterThan(a.seconds);
	});

	function timeStringToSecondsLocal(t: string): number {
		const [h, m, s] = t.split(':').map(Number);
		return h * 3600 + m * 60 + s;
	}
});
