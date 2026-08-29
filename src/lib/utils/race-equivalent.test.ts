import { describe, it, expect } from 'vitest';
import {
	impliedDistanceKm,
	equivalentSeconds,
	raceEquivalent,
	riegelCurve,
	fitExponent,
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
		expect(equivalentSeconds(2456, 10, 10, RIEGEL_EXPONENT)).toBeCloseTo(2456, 6);
	});

	it('follows the curve the API predictions sit on', () => {
		// 10 km 40:56 -> half marathon, against the API's own 1:31:04.
		expect(equivalentSeconds(2456, 10, 21.0975, RIEGEL_EXPONENT)).toBeCloseTo(5464, -1);
	});
});

describe('raceEquivalent', () => {
	it('reproduces the API 10 km prediction from the goal one', () => {
		// The strongest evidence the conversion is the API's own: a 15 km
		// prediction of 1:03:12 converts to 40:56, which is exactly what the same
		// response gives for 10 km.
		const equivalent = raceEquivalent('01:03:12', '04:12', RIEGEL_EXPONENT);

		expect(equivalent?.fromKm).toBe(15);
		expect(Math.round(equivalent!.seconds)).toBe(2456);
	});

	it('is barely moved by the exponent', () => {
		// 1.06 against 1.08 is twenty seconds on a forty-minute value, against the
		// four and a half minutes of improvement a goal like this asks for.
		const low = raceEquivalent('01:03:12', '04:12', 1.06)!;
		const high = raceEquivalent('01:03:12', '04:12', 1.08)!;

		expect(Math.abs(low.seconds - high.seconds)).toBeLessThan(25);
	});

	it('carries a pace alongside the time', () => {
		const equivalent = raceEquivalent('00:40:56', '04:05', RIEGEL_EXPONENT)!;
		expect(equivalent.paceSeconds).toBeCloseTo(equivalent.seconds / 10, 6);
	});

	it('converts to any reference distance', () => {
		const marathon = raceEquivalent('00:40:56', '04:05', RIEGEL_EXPONENT, 42.195)!;
		expect(Math.round(marathon.seconds)).toBe(11478);
	});

	it('says nothing rather than guessing on a malformed row', () => {
		expect(raceEquivalent('', '', RIEGEL_EXPONENT)).toBeNull();
		expect(raceEquivalent('01:03:12', '0:00', RIEGEL_EXPONENT)).toBeNull();
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

		const a = raceEquivalent(before.time, before.pace, RIEGEL_EXPONENT)!;
		const b = raceEquivalent(after.time, after.pace, RIEGEL_EXPONENT)!;

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

describe('fitExponent', () => {
	/** One real `best_times` block, as distances and seconds. */
	const block = [
		{ km: 5, seconds: 19 * 60 + 29 },
		{ km: 10, seconds: 40 * 60 + 56 },
		{ km: 21.0975, seconds: 60 * 60 + 31 * 60 + 4 },
		{ km: 42.195, seconds: 3 * 3600 + 11 * 60 + 18 }
	];

	it('recovers the exponent a prediction set was generated with', () => {
		expect(fitExponent(block)!).toBeCloseTo(RIEGEL_EXPONENT, 3);
	});

	it('reads a runner the constant does not describe', () => {
		// The whole reason this exists. The exponent is how steeply a runner's
		// time rises with distance — a fact about them, not about the model — so a
		// marathoner who holds pace and a 5 km runner who fades do not share one.
		for (const actual of [1.02, 1.06, 1.12]) {
			const theirs = [5, 10, 21.0975, 42.195].map((km) => ({
				km,
				seconds: 1169 * Math.pow(km / 5, actual)
			}));

			expect(fitExponent(theirs)!).toBeCloseTo(actual, 9);
		}
	});

	it('needs only two distances', () => {
		expect(fitExponent([block[0], block[3]])!).toBeCloseTo(RIEGEL_EXPONENT, 3);
	});

	it('has no slope to report from a single distance', () => {
		// One prediction fixes a level and says nothing about how it rises.
		expect(fitExponent([block[1]])).toBeNull();
		expect(fitExponent([])).toBeNull();
		expect(fitExponent([block[1], { km: 10, seconds: 2460 }])).toBeNull();
	});

	it('drops the columns a partial row left behind', () => {
		// An unparseable time arrives as a zero, and ln(0) would take the fit with
		// it — a set of four with one bad column is still a set of three.
		expect(fitExponent([...block, { km: 15, seconds: 0 }])!).toBeCloseTo(RIEGEL_EXPONENT, 3);
	});
});

describe('riegelCurve', () => {
	/** One real `best_times` block, as distances and seconds. */
	const block = [
		{ km: 5, seconds: 19 * 60 + 29 },
		{ km: 10, seconds: 40 * 60 + 56 },
		{ km: 21.0975, seconds: 60 * 60 + 31 * 60 + 4 },
		{ km: 42.195, seconds: 3 * 3600 + 11 * 60 + 18 }
	];

	it('gives back every prediction it was built from, exactly', () => {
		// The point of interpolating rather than fitting. A least-squares fit over
		// this same block reads the marathon 3:11:19 — one second off the figure
		// the API states, and off the row printed directly above the slider.
		const curve = riegelCurve(block)!;

		for (const point of block) {
			expect(curve(point.km)).toBeCloseTo(point.seconds, 6);
		}
	});

	it('reads the distances between them', () => {
		// 15 km, against the 1:03:12 the same account's API response gives for a
		// 15 km goal — a distance the block never mentions.
		expect(Math.round(riegelCurve(block)!(15))).toBeCloseTo(3792, -1);
	});

	it('travels on the exponent the block was generated with', () => {
		const curve = riegelCurve(block)!;
		const exponent = Math.log(curve(30) / curve(12)) / Math.log(30 / 12);

		expect(exponent).toBeCloseTo(RIEGEL_EXPONENT, 3);
	});

	it('follows the account rather than the constant', () => {
		// A block on 1.06 is a real possibility — the constant was measured from
		// one account — and the slider still has to agree with its own table.
		const flatter = [5, 10, 21.0975, 42.195].map((km) => ({
			km,
			seconds: 1169 * Math.pow(km / 5, 1.06)
		}));
		const curve = riegelCurve(flatter)!;

		expect(Math.log(curve(30) / curve(12)) / Math.log(30 / 12)).toBeCloseTo(1.06, 6);
	});

	it('carries the nearest segment on past the ends', () => {
		const curve = riegelCurve(block)!;

		// Below 5 km on the 5-10 exponent, above the marathon on the half-marathon
		// one. Both are extrapolation, and both are still the account's own curve.
		expect(Math.log(curve(3) / curve(5)) / Math.log(3 / 5)).toBeCloseTo(
			Math.log(block[1].seconds / block[0].seconds) / Math.log(10 / 5),
			6
		);
		expect(Math.log(curve(50) / curve(42.195)) / Math.log(50 / 42.195)).toBeCloseTo(
			Math.log(block[3].seconds / block[2].seconds) / Math.log(42.195 / 21.0975),
			6
		);
	});

	it('takes the level from a lone prediction and the slope from the constant', () => {
		const curve = riegelCurve([{ km: 10, seconds: 2456 }])!;

		expect(curve(10)).toBeCloseTo(2456, 6);
		expect(Math.round(curve(42.195))).toBe(11478);
	});

	it('drops the rows a malformed response leaves behind', () => {
		// `timeStringToSeconds` returns 0 for anything it cannot parse, and a zero
		// is ln(0) — one unparseable row would otherwise take the whole curve down
		// with it.
		const curve = riegelCurve([...block, { km: 15, seconds: 0 }, { km: 0, seconds: 100 }])!;

		expect(curve(10)).toBeCloseTo(2456, 6);
		expect(Math.round(curve(15))).toBeCloseTo(3792, -1);
	});

	it('is not thrown by points arriving out of order or twice', () => {
		const curve = riegelCurve([block[3], block[1], block[1], block[0], block[2]])!;

		for (const point of block) {
			expect(curve(point.km)).toBeCloseTo(point.seconds, 6);
		}
	});

	it('has no curve to offer when nothing parsed', () => {
		expect(riegelCurve([])).toBeNull();
		expect(riegelCurve([{ km: 10, seconds: 0 }])).toBeNull();
	});
});
