import { describe, it, expect } from 'vitest';
import {
	volumeBetween,
	earnCutoff,
	observedRate,
	planRate,
	forecast,
	FITNESS_LAG_DAYS,
	type VolumeWeek
} from './forecast';

const DAY_MS = 86_400_000;
const day = (n: number) => new Date(2026, 0, 5 + n); // 5 Jan 2026 is a Monday

/** `count` Monday-dated weeks of `km` each, starting at the goal's first week. */
function weeks(count: number, km: number | number[]): VolumeWeek[] {
	return Array.from({ length: count }, (_, i) => ({
		startsOn: day(i * 7),
		km: Array.isArray(km) ? km[i] : km
	}));
}

describe('volumeBetween', () => {
	it('prices a whole week at its whole distance', () => {
		expect(volumeBetween(weeks(2, 50), day(0), day(14))).toBeCloseTo(100, 6);
	});

	it('prices a part-finished week by the days inside the window', () => {
		// Three days into a 70 km week is three sevenths of it.
		expect(volumeBetween(weeks(1, 70), day(0), day(3))).toBeCloseTo(30, 6);
	});

	it('counts nothing for a window that ends before it starts', () => {
		expect(volumeBetween(weeks(2, 50), day(10), day(3))).toBe(0);
	});

	it('ignores weeks outside the window entirely', () => {
		expect(volumeBetween(weeks(4, 50), day(14), day(21))).toBeCloseTo(50, 6);
	});
});

describe('earnCutoff', () => {
	it('stops counting training ten days out', () => {
		const race = day(90);
		expect(race.getTime() - earnCutoff(race).getTime()).toBe(FITNESS_LAG_DAYS * DAY_MS);
	});
});

describe('planRate', () => {
	it('prices the gap over the volume that can still close it', () => {
		// 600s to find over 10 weeks of 50 km, less the 10-day lag window.
		const planned = weeks(10, 50);
		const cutoff = earnCutoff(day(70));
		const volume = volumeBetween(planned, day(0), cutoff);
		const rate = planRate({
			anchorSeconds: 3600,
			anchorDate: day(0),
			goalSeconds: 3000,
			planned,
			cutoff,
			now: day(35)
		})!;
		expect(rate.secondsPerKm).toBeCloseTo(600 / volume, 9);
		expect(rate.source).toBe('plan');
	});

	it('anchors on the volume still ahead, not the whole plan', () => {
		// Recording that began halfway through must not price the gap it found
		// against kilometres that were already spent before it started.
		const planned = weeks(10, 50);
		const cutoff = earnCutoff(day(70));
		const late = planRate({
			anchorSeconds: 3300,
			anchorDate: day(35),
			goalSeconds: 3000,
			planned,
			cutoff,
			now: day(45)
		})!;
		expect(late.secondsPerKm).toBeCloseTo(300 / volumeBetween(planned, day(35), cutoff), 9);
	});

	it('has no rate when the goal was already in reach', () => {
		const planned = weeks(10, 50);
		expect(
			planRate({
				anchorSeconds: 2900,
				anchorDate: day(0),
				goalSeconds: 3000,
				planned,
				cutoff: earnCutoff(day(70)),
				now: day(35)
			})
		).toBeNull();
	});

	it('declines when the anchor is too recent to have caught anything', () => {
		// Recording that began three days ago cannot show a runner falling behind
		// a rate derived from where they already were.
		const planned = weeks(10, 50);
		expect(
			planRate({
				anchorSeconds: 3600,
				anchorDate: day(32),
				goalSeconds: 3000,
				planned,
				cutoff: earnCutoff(day(70)),
				now: day(35)
			})
		).toBeNull();
	});
});

describe('observedRate', () => {
	const iso = (n: number) => {
		const d = day(n);
		return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
	};

	it('recovers the rate a consistent runner has been earning', () => {
		// 0.8s per km, on 50 km weeks, sampled every two weeks.
		const done = weeks(12, 50);
		const samples = [0, 14, 28, 42, 56, 70].map((n) => ({
			date: iso(n),
			seconds: 3600 - 0.8 * volumeBetween(done, day(0), day(n))
		}));
		const rate = observedRate(samples, done)!;
		expect(rate.secondsPerKm).toBeCloseTo(0.8, 6);
		expect(rate.source).toBe('observed');
		expect(rate.intervals).toBe(5);
	});

	it('measures against what was actually run, not what was planned', () => {
		// The middle four weeks were missed. A rate fitted on planned volume
		// would read the flat stretch as the training failing to work.
		const done = weeks(12, [50, 50, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50]);
		const samples = [0, 14, 28, 42, 56, 70].map((n) => ({
			date: iso(n),
			seconds: 3600 - 0.8 * volumeBetween(done, day(0), day(n))
		}));
		expect(observedRate(samples, done)!.secondsPerKm).toBeCloseTo(0.8, 6);
	});

	it('declines to fit a series that lurches, even when it nets out ahead', () => {
		// Gains of 300, -250, 280, -200, 270 over equal volume: the runner has
		// improved on balance, but the improvement plainly did not arrive with
		// the kilometres, and a rate fitted through this is fitted through noise.
		const done = weeks(12, 50);
		const offsets = [0, -300, 50, -230, -30, -300];
		const lurching = [0, 14, 28, 42, 56, 70].map((n, i) => ({
			date: iso(n),
			seconds: 3600 + offsets[i]
		}));
		expect(observedRate(lurching, done)).toBeNull();
	});

	it('scores a perfectly steady earner as a perfect fit', () => {
		// The case a centred R² gets exactly backwards: no variance about the
		// mean gain is not "explains nothing", it is "explains everything".
		const done = weeks(12, 50);
		const steady = [0, 14, 28, 42, 56, 70].map((n) => ({
			date: iso(n),
			seconds: 3600 - 0.8 * volumeBetween(done, day(0), day(n))
		}));
		expect(observedRate(steady, done)!.rSquared).toBeCloseTo(1, 9);
	});

	it('declines to forecast decline', () => {
		const done = weeks(12, 50);
		const slower = [0, 14, 28, 42, 56, 70].map((n) => ({
			date: iso(n),
			seconds: 3600 + 0.5 * volumeBetween(done, day(0), day(n))
		}));
		expect(observedRate(slower, done)).toBeNull();
	});

	it('needs more than a couple of intervals', () => {
		const done = weeks(12, 50);
		const few = [0, 14, 28].map((n) => ({
			date: iso(n),
			seconds: 3600 - 0.8 * volumeBetween(done, day(0), day(n))
		}));
		expect(observedRate(few, done)).toBeNull();
	});
});

describe('forecast', () => {
	const iso = (n: number) => {
		const d = day(n);
		return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
	};

	const race = day(70);
	const planned = weeks(10, 50);

	it('lands a runner who has done everything exactly on the goal', () => {
		const cutoff = earnCutoff(race);
		const rate = 600 / volumeBetween(planned, day(0), cutoff);
		const now = day(35);
		const result = forecast({
			nowSeconds: 3600 - rate * volumeBetween(planned, day(0), now),
			now,
			goalSeconds: 3000,
			raceDay: race,
			planned,
			done: planned,
			samples: [{ date: iso(0), seconds: 3600 }],
			goalStart: day(0)
		})!;

		expect(result.shortfallSeconds).toBeCloseTo(0, 6);
		expect(result.endSeconds).toBeCloseTo(3000, 6);
	});

	it('lands short by exactly what the missed weeks were worth', () => {
		// Same plan, but the runner banked nothing in the first five weeks, so
		// today's prediction has not moved at all.
		const cutoff = earnCutoff(race);
		const rate = 600 / volumeBetween(planned, day(0), cutoff);
		const now = day(35);
		const result = forecast({
			nowSeconds: 3600,
			now,
			goalSeconds: 3000,
			raceDay: race,
			planned,
			done: weeks(10, 0),
			samples: [{ date: iso(0), seconds: 3600 }],
			goalStart: day(0)
		})!;

		const lost = volumeBetween(planned, day(0), now) * rate;
		expect(result.shortfallSeconds).toBeCloseTo(lost, 6);
		expect(result.doneToDateKm).toBe(0);
		expect(result.askedToDateKm).toBeCloseTo(250, 6);
	});

	it('credits nothing to the days inside the taper window', () => {
		const now = day(35);
		const result = forecast({
			nowSeconds: 3600,
			now,
			goalSeconds: 3000,
			raceDay: race,
			planned,
			done: planned,
			samples: [{ date: iso(0), seconds: 3600 }],
			goalStart: day(0)
		})!;

		expect(result.remainingKm).toBeCloseTo(volumeBetween(planned, now, earnCutoff(race)), 9);
		// The line is flat from the cutoff to race day.
		const last = result.points[result.points.length - 1];
		const penultimate = result.points[result.points.length - 2];
		expect(last.seconds).toBeCloseTo(penultimate.seconds, 9);
		expect(last.date).toBe(iso(70));
	});

	it('prefers the rate the runner has actually shown over the plan design', () => {
		const done = weeks(10, 50);
		const samples = [0, 7, 14, 21, 28, 35].map((n) => ({
			date: iso(n),
			seconds: 3600 - 0.5 * volumeBetween(done, day(0), day(n))
		}));
		const now = day(35);
		const result = forecast({
			nowSeconds: 3600 - 0.5 * volumeBetween(done, day(0), now),
			now,
			goalSeconds: 3000,
			raceDay: race,
			planned,
			done,
			samples,
			goalStart: day(0)
		})!;

		expect(result.rate.source).toBe('observed');
		expect(result.rate.secondsPerKm).toBeCloseTo(0.5, 6);
		expect(result.gainSeconds).toBeCloseTo(result.remainingKm * 0.5, 6);
	});

	it('draws nothing once race day is inside the lag window', () => {
		expect(
			forecast({
				nowSeconds: 3600,
				now: day(65),
				goalSeconds: 3000,
				raceDay: race,
				planned,
				done: planned,
				samples: [{ date: iso(0), seconds: 3600 }],
				goalStart: day(0)
			})
		).toBeNull();
	});
});
