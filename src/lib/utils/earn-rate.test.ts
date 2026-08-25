import { describe, it, expect } from 'vitest';
import { earnRateFromHistory, predictionAt, backtestEarnRate, type EarnWeek } from './earn-rate';
import type { Sample } from './projection';

const monday = (week: number) => new Date(Date.UTC(2026, 5, 29 + week * 7));

/** A runner who earns exactly `rate` seconds for every kilometre run. */
function obedientWeeks(dones: number[], rate: number, start = 3900): EarnWeek[] {
	let standing = start;
	return dones.map((done, i) => {
		const from = standing;
		standing -= done * rate;
		return { startsOn: monday(i), done, fromSeconds: from, toSeconds: standing };
	});
}

describe('earnRateFromHistory', () => {
	it('recovers what a kilometre has actually been worth', () => {
		const rate = earnRateFromHistory(obedientWeeks([40, 55, 30, 60, 45, 50], 0.7))!;

		expect(rate.secondsPerUnit).toBeCloseTo(0.7, 6);
		expect(rate.rSquared).toBeCloseTo(1, 6);
		expect(rate.weeks).toBe(6);
	});

	it('fits through the origin, so rest cannot earn', () => {
		// A week off earns nothing. That is the one point on this line we know,
		// and a free intercept would happily claim improvement out of it.
		const weeks = obedientWeeks([0, 0, 0, 0, 0, 0], 0.7);
		expect(earnRateFromHistory(weeks)).toBeNull();
	});

	it('reports a poor fit when the prediction moves for its own reasons', () => {
		// Volume steady, prediction wandering: the rate it fits is meaningless and
		// the fit says so, which is the number to check before drawing anything.
		const wandering: EarnWeek[] = [40, 45, 42, 48, 44, 46].map((done, i) => ({
			startsOn: monday(i),
			done,
			fromSeconds: 3800 + [0, 30, -20, 25, -30, 15][i],
			toSeconds: 3800 + [30, -20, 25, -30, 15, 5][i]
		}));

		expect(earnRateFromHistory(wandering)!.rSquared).toBeLessThan(0.5);
	});

	it('refuses to fit a couple of weeks', () => {
		expect(earnRateFromHistory(obedientWeeks([40, 55], 0.7))).toBeNull();
	});
});

describe('predictionAt', () => {
	const samples: Sample[] = [
		{ date: '2026-07-06', seconds: 3800 },
		{ date: '2026-07-20', seconds: 3780 },
		{ date: '2026-08-03', seconds: 3760 }
	];

	it('takes the most recent value on or before the date', () => {
		expect(predictionAt(samples, new Date(Date.UTC(2026, 6, 25)))).toBe(3780);
		expect(predictionAt(samples, new Date(Date.UTC(2026, 6, 20)))).toBe(3780);
	});

	it('has nothing before the series starts', () => {
		expect(predictionAt(samples, new Date(Date.UTC(2026, 6, 1)))).toBeNull();
	});
});

describe('backtestEarnRate', () => {
	const dones = [40, 55, 30, 60, 45, 50, 35, 55];
	const rate = 0.7;

	/** The series a runner earning exactly `rate` would have recorded. */
	function samplesFor(weeks: EarnWeek[]): Sample[] {
		return weeks.flatMap((w) => [
			{ date: w.startsOn.toISOString().slice(0, 10), seconds: w.fromSeconds },
			{
				date: new Date(w.startsOn.getTime() + 6 * 86_400_000).toISOString().slice(0, 10),
				seconds: w.toSeconds
			}
		]);
	}

	it('scores a rate that matches the runner as nearly exact', () => {
		const weeks = obedientWeeks(dones, rate);
		const result = backtestEarnRate({
			samples: samplesFor(weeks),
			weeks: weeks.map((w) => ({ startsOn: w.startsOn, done: w.done })),
			secondsPerUnit: rate
		})!;

		expect(result.meanAbsErrorSeconds).toBeLessThan(1);
		expect(Math.abs(result.biasSeconds)).toBeLessThan(1);
	});

	it('measures the rate against doing nothing at all', () => {
		// The comparison that decides whether a model is worth drawing: this
		// runner improves, so "nothing changes" should be clearly worse.
		const weeks = obedientWeeks(dones, rate);
		const result = backtestEarnRate({
			samples: samplesFor(weeks),
			weeks: weeks.map((w) => ({ startsOn: w.startsOn, done: w.done })),
			secondsPerUnit: rate
		})!;

		expect(result.naiveMeanAbsErrorSeconds).toBeGreaterThan(result.meanAbsErrorSeconds);
	});

	it('catches a rate that claims improvement the runner never had', () => {
		// Training done, prediction flat — the case the shipped model would have
		// drawn a confident line through.
		const flat: EarnWeek[] = dones.map((done, i) => ({
			startsOn: monday(i),
			done,
			fromSeconds: 3800,
			toSeconds: 3800
		}));

		const result = backtestEarnRate({
			samples: samplesFor(flat),
			weeks: flat.map((w) => ({ startsOn: w.startsOn, done: w.done })),
			secondsPerUnit: rate
		})!;

		// Every second it promised is an error, and doing nothing beats it.
		expect(result.biasSeconds).toBeLessThan(-50);
		expect(result.naiveMeanAbsErrorSeconds).toBeLessThan(result.meanAbsErrorSeconds);
	});

	it('has nothing to report without enough weeks to span a horizon', () => {
		const weeks = obedientWeeks([40, 55], rate);
		expect(
			backtestEarnRate({
				samples: samplesFor(weeks),
				weeks: weeks.map((w) => ({ startsOn: w.startsOn, done: w.done })),
				secondsPerUnit: rate
			})
		).toBeNull();
	});
});
