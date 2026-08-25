import { describe, it, expect } from 'vitest';
import {
	linearTrend,
	project,
	easedGain,
	complianceRate,
	MIN_SAMPLES,
	MIN_FIT,
	type Sample
} from './projection';

/** A steadily improving runner: `perDay` seconds off the prediction each day. */
function series(days: number[], start = 3900, perDay = -2): Sample[] {
	return days.map((d) => ({
		date: new Date(Date.UTC(2026, 4, 1 + d)).toISOString().slice(0, 10),
		seconds: start + perDay * d
	}));
}

describe('linearTrend', () => {
	it('recovers the rate a runner is actually improving at', () => {
		const trend = linearTrend(series([0, 7, 14, 21, 28, 35, 42]))!;

		expect(trend.slopePerDay).toBeCloseTo(-2, 6);
		expect(trend.samples).toBe(7);
	});

	it('weighs a burst of updates by date, not by how many there were', () => {
		// Five samples in one week and two months of quiet either side must not
		// let that week set the slope.
		const bursty = linearTrend(series([0, 30, 31, 32, 33, 34, 60, 90]))!;
		const even = linearTrend(series([0, 15, 30, 45, 60, 75, 90]))!;

		expect(bursty.slopePerDay).toBeCloseTo(even.slopePerDay, 6);
	});

	it('refuses to fit a line through too little', () => {
		expect(linearTrend(series([0, 7, 14]))).toBeNull();
		expect(linearTrend([])).toBeNull();
	});

	it('refuses a long-enough list crammed into a short span', () => {
		// Six samples over five days is six readings of one week, not a trend.
		expect(linearTrend(series([0, 1, 2, 3, 4, 5]))).toBeNull();
		expect(MIN_SAMPLES).toBeGreaterThan(1);
	});

	it('reports how much of the movement the line explains', () => {
		// A clean straight line explains all of it.
		expect(linearTrend(series([0, 14, 28, 42, 56, 70]))!.rSquared).toBeCloseTo(1, 6);
	});

	it('explains nothing of a series that wanders and goes nowhere', () => {
		// Three months of movement with no direction — the case that was drawing a
		// confident flat line across the chart as though it were a finding.
		const wandering: Sample[] = [0, 14, 28, 42, 56, 70, 84].map((d, i) => ({
			date: new Date(Date.UTC(2026, 4, 1 + d)).toISOString().slice(0, 10),
			seconds: 3790 + [0, 40, -30, 25, -35, 30, -5][i]
		}));

		expect(linearTrend(wandering)!.rSquared).toBeLessThan(MIN_FIT);
	});

	it('starts a projection where the recorded line ends', () => {
		const samples = series([0, 14, 28, 42, 56, 70]);
		const trend = linearTrend(samples)!;

		// Not the fitted value: a dashed line beginning a few pixels off the end
		// of the solid one reads as a mistake whatever the arithmetic says.
		expect(trend.lastSeconds).toBe(samples[samples.length - 1].seconds);
	});

	it('refuses a series that never moves in time', () => {
		const sameDay = Array.from({ length: 8 }, () => ({ date: '2026-05-01', seconds: 3600 }));
		expect(linearTrend(sameDay)).toBeNull();
	});
});

describe('easedGain', () => {
	it('is nearly the straight line over a few weeks', () => {
		const straight = -2 * 14;
		expect(easedGain(-2, 14)).toBeGreaterThan(straight);
		expect(easedGain(-2, 14) / straight).toBeGreaterThan(0.8);
	});

	it('stops promising the same rate for ever', () => {
		// Two years at two seconds a day would be an impossible 24 minutes.
		const straight = -2 * 730;
		expect(Math.abs(easedGain(-2, 730))).toBeLessThan(Math.abs(straight) / 4);
	});
});

describe('project', () => {
	const trend = linearTrend(series([0, 14, 28, 42, 56, 70]))!;

	it('carries the trend to the date asked for', () => {
		const raceDay = new Date(Date.UTC(2026, 6, 20));
		const projection = project(trend, raceDay, { label: 'Current trend' })!;

		expect(projection.points).toHaveLength(2);
		expect(projection.points[0].seconds).toBe(trend.lastSeconds);
		expect(projection.points[1].date).toBe('2026-07-20');
		expect(projection.endSeconds).toBeLessThan(projection.points[0].seconds);
	});

	it('improves faster when more of the plan is assumed', () => {
		const raceDay = new Date(Date.UTC(2026, 6, 20));
		const asIs = project(trend, raceDay, { label: 'a' })!;
		const asPlanned = project(trend, raceDay, { label: 'b', rate: 1.5 })!;

		expect(asPlanned.endSeconds).toBeLessThan(asIs.endSeconds);
	});

	it('has nothing to draw towards a date already past', () => {
		expect(project(trend, new Date(Date.UTC(2026, 4, 2)), { label: 'a' })).toBeNull();
	});
});

describe('complianceRate', () => {
	it('asks for more where a plan went unfinished', () => {
		expect(complianceRate(46, 100)).toBeCloseTo(1.5, 6);
		expect(complianceRate(80, 100)).toBeCloseTo(1.25, 6);
	});

	it('never promises a runner three times the improvement', () => {
		// A third of the plan done does not mean three times the gain from here:
		// improvement scales with volume only roughly, and not at all past a point.
		expect(complianceRate(33, 100)).toBe(1.5);
	});

	it('claims nothing extra from someone already doing the work', () => {
		expect(complianceRate(100, 100)).toBe(1);
		expect(complianceRate(120, 100)).toBe(1);
	});

	it('claims nothing when there is nothing to compare', () => {
		expect(complianceRate(0, 100)).toBe(1);
		expect(complianceRate(50, 0)).toBe(1);
	});
});
