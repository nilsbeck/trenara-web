import { describe, it, expect } from 'vitest';
import {
	paceRatio,
	splitByGoalDistance,
	summarise,
	formatDelta,
	paceTrend,
	TREND_FLAT_BAND_PER_WEEK,
	TREND_WINDOW_DAYS,
	TREND_REACH_DAYS
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

describe('splitByGoalDistance', () => {
	it('keeps the readings recorded over the goal distance', () => {
		const split = splitByGoalDistance([point(13500), point(13400), point(13320)], 42.2);
		expect(split.forGoal).toHaveLength(3);
		expect(split.fromOtherGoals).toHaveLength(0);
		expect(split.otherDistances).toEqual([]);
	});

	it('leaves out the day the goal changed under it', () => {
		// A 15 km goal swapped for a marathon: the morning's reading is a 1:03
		// over 15 km, and every marathon reading after it is three hours.
		const fifteen = point(3792, 15);
		const split = splitByGoalDistance([fifteen, point(13500), point(13400)], 42.2);
		expect(split.forGoal).toEqual([point(13500), point(13400)]);
		expect(split.fromOtherGoals).toEqual([fifteen]);
		expect(split.otherDistances).toEqual([15]);
	});

	it('survives the rounding in a stored pace', () => {
		// What the row actually holds: a pace kept to the whole second, which
		// divides back out to 15.048 km rather than 15.
		const rounded = { predictedTime: 3792, predictedPace: Math.round(3792 / 15) };
		expect(splitByGoalDistance([rounded], 15).forGoal).toEqual([rounded]);
	});

	it('tells a half marathon from a 20 km goal', () => {
		const twenty = point(5400, 20);
		const split = splitByGoalDistance([twenty, point(5700, 21.0975)], 21.0975);
		expect(split.fromOtherGoals).toEqual([twenty]);
		expect(split.otherDistances).toEqual([20]);
	});

	it('names every distance it dropped, once each', () => {
		const split = splitByGoalDistance(
			[point(3792, 15), point(2400, 10), point(3800, 15), point(13500)],
			42.2
		);
		expect(split.forGoal).toEqual([point(13500)]);
		expect(split.otherDistances).toEqual([10, 15]);
	});

	it('keeps everything when the goal states no distance', () => {
		// A filter that cannot see what it is filtering for must not be the
		// reason a runner's history disappears.
		const points = [point(3792, 15), point(13500)];
		expect(splitByGoalDistance(points, null).forGoal).toEqual(points);
		expect(splitByGoalDistance(points, 0).forGoal).toEqual(points);
		expect(splitByGoalDistance(points, NaN).forGoal).toEqual(points);
	});

	it('drops a row whose own numbers imply nothing', () => {
		const broken = { predictedTime: 13500, predictedPace: 0 };
		const split = splitByGoalDistance([broken, point(13500)], 42.2);
		expect(split.forGoal).toEqual([point(13500)]);
		expect(split.fromOtherGoals).toEqual([broken]);
		// Nothing to name: the row does not say what distance it was about.
		expect(split.otherDistances).toEqual([]);
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
		// 300 -> 294 across the fortnight: 3s/km a week off the pace.
		const trend = paceTrend(
			[reading(14, 300), reading(9, 298), reading(4, 296), reading(0, 294)],
			NOW
		);
		expect(trend!.direction).toBe('improving');
		expect(trend!.perWeekSeconds).toBeCloseTo(-3, 1);
		expect(trend!.days).toBe(14);
		expect(trend!.samples).toBe(4);
	});

	it('calls a rising pace curve detraining', () => {
		const trend = paceTrend(
			[reading(14, 294), reading(9, 296), reading(4, 298), reading(0, 300)],
			NOW
		);
		expect(trend!.direction).toBe('detraining');
		expect(trend!.perWeekSeconds).toBeCloseTo(3, 1);
	});

	it('calls a flat curve maintaining', () => {
		expect(paceTrend([reading(13, 300), reading(6, 300), reading(0, 300)], NOW)!.direction).toBe(
			'maintaining'
		);
	});

	it('reads the stored rounding as maintaining, not as a direction', () => {
		// A single second ticking either way inside a fortnight is the pace being
		// stored to the second, not training. This is what the band is sized for.
		const trend = paceTrend(
			[reading(13, 300), reading(9, 299), reading(4, 300), reading(0, 299)],
			NOW
		);
		expect(trend!.direction).toBe('maintaining');
		expect(Math.abs(trend!.perWeekSeconds)).toBeLessThan(TREND_FLAT_BAND_PER_WEEK);
	});

	it('still hears a block-rate improvement through the wider band', () => {
		// 2s/km a week is what a block taking 20-30s/km off a marathon looks like.
		const trend = paceTrend([reading(14, 304), reading(7, 302), reading(0, 300)], NOW);
		expect(trend!.perWeekSeconds).toBeCloseTo(-2, 1);
		expect(trend!.direction).toBe('improving');
	});

	it('fits the window rather than reading off the endpoints', () => {
		// One race-effort session drops the last reading off an otherwise flat
		// series. Subtracting the endpoints hands that single session the whole
		// verdict; the fit weighs it against every reading that did not move.
		const trend = paceTrend(
			[reading(12, 300), reading(9, 300), reading(6, 300), reading(3, 300), reading(0, 294)],
			NOW
		);
		const endpoints = ((294 - 300) / 12) * 7;
		expect(Math.abs(trend!.perWeekSeconds)).toBeLessThan(Math.abs(endpoints));
	});

	it('answers from a fortnight, without waiting for a block of history', () => {
		// Two weeks into a new goal there is no more than this, and the runner
		// still wants to know which way it is going.
		const trend = paceTrend([reading(12, 300), reading(6, 296), reading(0, 292)], NOW);
		expect(trend!.direction).toBe('improving');
		expect(trend!.days).toBeLessThanOrEqual(TREND_WINDOW_DAYS);
	});

	it('reports the fortnight, not the block behind it', () => {
		// Big gains early in the block, sliding for the last two weeks. The badge
		// is a claim about now, so it reports the slide.
		const trend = paceTrend(
			[
				reading(70, 330),
				reading(50, 315),
				reading(30, 300),
				reading(12, 292),
				reading(6, 296),
				reading(0, 300)
			],
			NOW
		);
		expect(trend!.direction).toBe('detraining');
		expect(trend!.samples).toBe(3);
		expect(trend!.days).toBeLessThanOrEqual(TREND_WINDOW_DAYS);
	});

	it('needs more than two readings', () => {
		expect(paceTrend([reading(12, 300), reading(0, 290)], NOW)).toBeNull();
	});

	it('needs a long enough span to call a direction', () => {
		// Three readings inside a week is one session, not a trend — and a week
		// is too short for the fit to see past the stored rounding.
		expect(paceTrend([reading(6, 300), reading(3, 295), reading(0, 290)], NOW)).toBeNull();
	});

	it('ignores a series that stops well before today', () => {
		// Nobody is being measured any more, which is not the same as detraining.
		expect(paceTrend([reading(60, 300), reading(45, 305), reading(30, 310)], NOW)).toBeNull();
	});

	it('reaches past a sparse fortnight, up to the cap', () => {
		// A prediction that only moves twice a month still has a direction.
		const trend = paceTrend([reading(26, 310), reading(20, 305), reading(2, 300)], NOW);
		expect(trend!.direction).toBe('improving');
		expect(trend!.samples).toBe(3);
		expect(trend!.days).toBeLessThanOrEqual(TREND_REACH_DAYS);
	});

	it('will not reach past the cap to find a third reading', () => {
		// The two older readings are this block's opening weeks. Stretching that
		// far would answer a question nobody asked.
		expect(paceTrend([reading(80, 320), reading(60, 310), reading(2, 300)], NOW)).toBeNull();
	});

	it('drops readings with no usable date or pace', () => {
		const trend = paceTrend(
			[
				{ date: 'not a date', predictedPace: 400 },
				{ date: reading(12, 0).date, predictedPace: 0 },
				reading(12, 300),
				reading(6, 296),
				reading(0, 292)
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
