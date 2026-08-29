import { describe, it, expect } from 'vitest';
import {
	paceRatio,
	summarise,
	formatDelta,
	paceTrend,
	TREND_FLAT_BAND_PER_WEEK,
	TREND_MIN_SAMPLES
} from './prediction-graph';

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

describe('paceTrend', () => {
	const NOW = new Date('2025-06-01T12:00:00Z');

	/** A reading `daysAgo` before `NOW`, at `pace` seconds per km. */
	function reading(daysAgo: number, pace: number) {
		return {
			date: new Date(NOW.getTime() - daysAgo * 86_400_000).toISOString(),
			predictedPace: pace
		};
	}

	it('calls a falling pace curve improving', () => {
		// 300 → 288 s/km over 30 days: 2.8s/km a week off the pace.
		const trend = paceTrend(
			[reading(30, 300), reading(20, 296), reading(10, 292), reading(0, 288)],
			NOW
		);
		expect(trend!.direction).toBe('improving');
		expect(trend!.perWeekSeconds).toBeCloseTo(-2.8, 1);
		expect(trend!.days).toBe(30);
		expect(trend!.samples).toBe(4);
	});

	it('calls a rising pace curve detraining', () => {
		const trend = paceTrend(
			[reading(30, 288), reading(20, 292), reading(10, 296), reading(0, 300)],
			NOW
		);
		expect(trend!.direction).toBe('detraining');
		expect(trend!.perWeekSeconds).toBeCloseTo(2.8, 1);
	});

	it('calls a flat curve maintaining', () => {
		expect(paceTrend([reading(30, 300), reading(15, 300), reading(0, 300)], NOW)!.direction).toBe(
			'maintaining'
		);
	});

	it('reads a wobble inside the band as maintaining, not as a direction', () => {
		// A second either way across a month is the stored rounding, not training.
		const trend = paceTrend(
			[reading(30, 300), reading(20, 299), reading(10, 300), reading(0, 299)],
			NOW
		);
		expect(trend!.direction).toBe('maintaining');
		expect(Math.abs(trend!.perWeekSeconds)).toBeLessThan(TREND_FLAT_BAND_PER_WEEK);
	});

	it('fits the window rather than reading off the endpoints', () => {
		// One race-effort session drops the last reading off an otherwise flat
		// series. Subtracting the endpoints hands that single session the whole
		// verdict; the fit weighs it against every reading that did not move.
		const trend = paceTrend(
			[
				reading(40, 300),
				reading(32, 300),
				reading(24, 300),
				reading(16, 300),
				reading(8, 300),
				reading(0, 294)
			],
			NOW
		);
		const endpoints = ((294 - 300) / 40) * 7;
		expect(Math.abs(trend!.perWeekSeconds)).toBeLessThan(Math.abs(endpoints));
	});

	it('needs more than two readings', () => {
		expect(paceTrend([reading(30, 300), reading(0, 280)], NOW)).toBeNull();
	});

	it('needs a long enough span to call a direction', () => {
		// Three readings inside a week is one session, not a trend.
		expect(paceTrend([reading(6, 300), reading(3, 295), reading(0, 290)], NOW)).toBeNull();
	});

	it('ignores a series that stops well before today', () => {
		// Nobody is being measured any more, which is not the same as detraining.
		expect(paceTrend([reading(120, 300), reading(100, 305), reading(80, 310)], NOW)).toBeNull();
	});

	it('prefers the recent window over the whole history', () => {
		// Big gains last winter, sliding now. The badge reports now.
		const trend = paceTrend(
			[
				reading(200, 330),
				reading(150, 315),
				reading(100, 300),
				reading(30, 292),
				reading(15, 296),
				reading(0, 300)
			],
			NOW
		);
		expect(trend!.direction).toBe('detraining');
		expect(trend!.samples).toBe(3);
	});

	it('falls back to the last few readings when the window is sparse', () => {
		// A prediction that only moves twice a season still has a direction.
		const trend = paceTrend([reading(150, 320), reading(90, 310), reading(20, 300)], NOW);
		expect(trend!.direction).toBe('improving');
		expect(trend!.samples).toBe(TREND_MIN_SAMPLES);
	});

	it('drops readings with no usable date or pace', () => {
		const trend = paceTrend(
			[
				{ date: 'not a date', predictedPace: 400 },
				{ date: reading(30, 0).date, predictedPace: 0 },
				reading(30, 300),
				reading(15, 294),
				reading(0, 288)
			],
			NOW
		);
		expect(trend!.samples).toBe(3);
		expect(trend!.direction).toBe('improving');
	});

	it('is null with nothing to read', () => {
		expect(paceTrend([], NOW)).toBeNull();
	});
});
