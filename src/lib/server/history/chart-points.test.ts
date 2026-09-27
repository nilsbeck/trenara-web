import { describe, it, expect } from 'vitest';
import type { UserStats } from '$lib/server/trenara/types';
import type { ChartDataPoint } from '$lib/components/charts/prediction-chart.svelte';
import { stripPaceUnit, toChartData, utcDay, withCurrentReading } from './chart-points';

function stats(time: string, pace: string): UserStats {
	return { best_times: { time_for_goal: time, pace_for_goal: pace } } as unknown as UserStats;
}

function point(date: string, time: string, pace: string): ChartDataPoint {
	return toChartData([
		{ recorded_at: date, predicted_time: time, predicted_pace: pace } as never
	])[0];
}

describe('stripPaceUnit', () => {
	it('drops the unit Trenara appends', () => {
		expect(stripPaceUnit('5:06 min/km')).toBe('5:06');
		expect(stripPaceUnit('8:12 min/mi')).toBe('8:12');
	});

	it('is null for nothing to strip', () => {
		expect(stripPaceUnit(undefined)).toBeNull();
		expect(stripPaceUnit(' min/km')).toBeNull();
	});
});

describe('utcDay', () => {
	it('is the UTC day, not the local one', () => {
		expect(utcDay(new Date('2026-09-27T23:30:00-05:00'))).toBe('2026-09-28');
	});
});

describe('withCurrentReading', () => {
	const today = '2026-09-27';

	it('appends today when the reading moved since the last stored row', () => {
		const rows = [point('2026-09-20', '3:40:00', '5:13')];
		const result = withCurrentReading(rows, stats('3:35:00', '5:06 min/km'), today);

		expect(result).toHaveLength(2);
		expect(result[1]).toEqual({
			date: today,
			predictedTime: 3 * 3600 + 35 * 60,
			predictedPace: 5 * 60 + 6,
			formattedTime: '3:35:00',
			formattedPace: '5:06'
		});
	});

	it('adds nothing when the reading equals the last stored row', () => {
		const rows = [point('2026-09-20', '3:35:00', '5:06')];
		expect(withCurrentReading(rows, stats('3:35:00', '5:06 min/km'), today)).toBe(rows);
	});

	it("replaces today's row rather than adding a second one for the day", () => {
		const rows = [point('2026-09-20', '3:40:00', '5:13'), point(today, '3:38:00', '5:10')];
		const result = withCurrentReading(rows, stats('3:35:00', '5:06 min/km'), today);

		expect(result.map((p) => [p.date, p.formattedTime])).toEqual([
			['2026-09-20', '3:40:00'],
			[today, '3:35:00']
		]);
	});

	it('draws the reading alone when nothing is stored yet', () => {
		const result = withCurrentReading([], stats('3:35:00', '5:06'), today);
		expect(result.map((p) => p.date)).toEqual([today]);
	});

	it('leaves the rows alone without a usable reading', () => {
		const rows = [point('2026-09-20', '3:40:00', '5:13')];
		expect(withCurrentReading(rows, null, today)).toBe(rows);
		expect(withCurrentReading(rows, stats('', '5:06'), today)).toBe(rows);
		expect(withCurrentReading(rows, stats('soon', 'later'), today)).toBe(rows);
	});
});
