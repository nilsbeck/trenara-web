import { describe, it, expect } from 'vitest';
import { paceRatio, summarise, formatDelta } from './prediction-graph';

/** A marathon prediction: pace is the time over 42.2 km. */
function point(timeSeconds: number, distanceKm = 42.2) {
	const pace = timeSeconds / distanceKm;
	return {
		predictedTime: timeSeconds,
		predictedPace: pace,
		formattedTime: String(timeSeconds),
		formattedPace: String(Math.round(pace))
	};
}

describe('paceRatio', () => {
	it('finds the conversion for a series over one distance', () => {
		const ratio = paceRatio([point(13500), point(13400), point(13320)]);
		expect(ratio).not.toBeNull();
		// 1 / 42.2 — one second of pace per 42.2 seconds of predicted time.
		expect(ratio!).toBeCloseTo(1 / 42.2, 6);
		// Which means the conversion round-trips.
		expect(13500 * ratio!).toBeCloseTo(13500 / 42.2, 6);
	});

	it('tolerates the rounding in stored time and pace strings', () => {
		// Same marathon, paces rounded to whole seconds.
		const rounded = [13500, 13400, 13320].map((t) => ({
			predictedTime: t,
			predictedPace: Math.round(t / 42.2)
		}));
		expect(paceRatio(rounded)).not.toBeNull();
	});

	it('refuses a series that spans two distances', () => {
		// A 10K prediction and a marathon one cannot share one conversion.
		expect(paceRatio([point(2400, 10), point(13500, 42.2)])).toBeNull();
	});

	it('ignores points with no time or no pace', () => {
		const ratio = paceRatio([{ predictedTime: 0, predictedPace: 0 }, point(13500), point(13400)]);
		expect(ratio).toBeCloseTo(1 / 42.2, 6);
	});

	it('is null when there is nothing usable', () => {
		expect(paceRatio([])).toBeNull();
		expect(paceRatio([{ predictedTime: 0, predictedPace: 0 }])).toBeNull();
	});
});

describe('summarise', () => {
	it('counts a falling prediction as time gained', () => {
		const summary = summarise([point(13500), point(13366)]);
		expect(summary!.gainedSeconds).toBe(134);
		expect(summary!.latest.predictedTime).toBe(13366);
		expect(summary!.hasTrend).toBe(true);
	});

	it('counts a rising prediction as time lost', () => {
		expect(summarise([point(13366), point(13500)])!.gainedSeconds).toBe(-134);
	});

	it('has no trend from a single point', () => {
		const summary = summarise([point(13500)]);
		expect(summary!.gainedSeconds).toBe(0);
		expect(summary!.hasTrend).toBe(false);
	});

	it('is null for an empty series', () => {
		expect(summarise([])).toBeNull();
	});
});

describe('formatDelta', () => {
	it('drops the hour when there is none', () => {
		expect(formatDelta(134)).toBe('2:14');
		expect(formatDelta(9)).toBe('0:09');
	});

	it('keeps the hour when there is one', () => {
		expect(formatDelta(3800)).toBe('1:03:20');
	});

	it('reads a loss as a magnitude, leaving the sign to the caller', () => {
		expect(formatDelta(-134)).toBe('2:14');
	});
});
