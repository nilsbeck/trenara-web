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
