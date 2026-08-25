import { describe, it, expect } from 'vitest';
import { readWeekDistance, readGoalDistance, formatKm } from './distance-graph';
import type { UserStats } from '$lib/server/trenara/types';

type WeekSeries = UserStats['graph_stats']['weeks'];
type GoalSeries = UserStats['graph_stats']['goal'];

function dayRow(
	order: number,
	day: string,
	todo: number | null,
	done: number | null,
	isToday = false
) {
	return {
		order,
		day,
		date: `2026-08-${String(24 + order).padStart(2, '0')}`,
		is_today: isToday,
		done: done === null ? null : `${done}km`,
		done_value: done,
		done_unit: done === null ? null : 'km',
		done_unit_text: done === null ? null : 'km',
		todo: todo === null ? null : `${todo}km`,
		todo_value: todo,
		todo_unit: todo === null ? null : 'km',
		todo_unit_text: todo === null ? null : 'km'
	};
}

/** The week behind the reference screenshot: 8 km run of 36.94 planned. */
const weekSeries: WeekSeries = {
	data: [
		dayRow(0, 'Monday', 9.5, 8, true),
		dayRow(1, 'Tuesday', null, null),
		dayRow(2, 'Wednesday', 6.5, null),
		dayRow(3, 'Thursday', null, null),
		dayRow(4, 'Friday', 12, null),
		dayRow(5, 'Saturday', null, null),
		dayRow(6, 'Sunday', 8.94, null)
	],
	done: '8km',
	done_value: 8,
	done_unit: 'km',
	done_unit_text: 'km',
	todo: '36.94km',
	todo_value: 36.94,
	todo_unit: 'km',
	todo_unit_text: 'km'
};

function weekRow(week: number, order: number, todo: number, done: number | null, current = false) {
	return {
		week,
		order,
		month: 'August',
		year: 2026,
		is_current_week: current,
		done: done === null ? null : `${done}km`,
		done_value: done,
		done_unit: done === null ? null : 'km',
		done_unit_text: done === null ? null : 'km',
		todo: `${todo}km`,
		todo_value: todo,
		todo_unit: 'km',
		todo_unit_text: 'km'
	};
}

const goalSeries: GoalSeries = {
	data: [
		weekRow(28, 0, 40.2, 8),
		weekRow(29, 1, 44.1, 43.6),
		weekRow(30, 2, 43.9, 38.2),
		weekRow(34, 6, 59.4, 54, true),
		weekRow(39, 11, 40.5, null)
	],
	done: '159.69km',
	done_value: 159.69,
	done_unit: 'km',
	done_unit_text: 'km',
	todo: '595.36km',
	todo_value: 595.36,
	todo_unit: 'km',
	todo_unit_text: 'km'
};

describe('readWeekDistance', () => {
	it('plots one point per day, Monday first', () => {
		const series = readWeekDistance(weekSeries);
		expect(series.points).toHaveLength(7);
		expect(series.points.map((p) => p.label)).toEqual([
			'Mon',
			'Tue',
			'Wed',
			'Thu',
			'Fri',
			'Sat',
			'Sun'
		]);
	});

	it('orders by `order`, not by the order the rows arrived in', () => {
		const shuffled: WeekSeries = {
			...weekSeries,
			data: [weekSeries.data[3], weekSeries.data[0], weekSeries.data[6]]
		};
		expect(readWeekDistance(shuffled).points.map((p) => p.label)).toEqual(['Mon', 'Thu', 'Sun']);
	});

	it('reads a rest day and an unrun day as zero, so the line stays continuous', () => {
		const series = readWeekDistance(weekSeries);
		// Tuesday: nothing planned, nothing run.
		expect(series.points[1]).toMatchObject({ todoKm: 0, doneKm: 0 });
		// Wednesday: 6.5 planned, not yet run.
		expect(series.points[2]).toMatchObject({ todoKm: 6.5, doneKm: 0 });
	});

	it('marks today', () => {
		const current = readWeekDistance(weekSeries).points.filter((p) => p.isCurrent);
		expect(current).toHaveLength(1);
		expect(current[0].label).toBe('Mon');
	});

	it('takes the totals from the response, not from the rows', () => {
		const series = readWeekDistance(weekSeries);
		expect(series.totalDoneKm).toBe(8);
		expect(series.totalTodoKm).toBe(36.94);
		// The rows themselves add to less than the stated plan.
		const rowSum = series.points.reduce((sum, p) => sum + p.todoKm, 0);
		expect(rowSum).toBeCloseTo(36.94, 2);
	});

	it('keeps an already-abbreviated weekday as it is', () => {
		const abbreviated: WeekSeries = { ...weekSeries, data: [dayRow(0, 'Mon', 5, 5)] };
		expect(readWeekDistance(abbreviated).points[0].label).toBe('Mon');
	});

	it('answers empty for missing stats rather than throwing', () => {
		for (const input of [null, undefined, { ...weekSeries, data: [] }]) {
			const series = readWeekDistance(input as WeekSeries);
			expect(series.points).toEqual([]);
			expect(series.totalTodoKm).toBe(0);
			expect(series.axisLabel).toBe('Day of week');
		}
	});
});

describe('readGoalDistance', () => {
	it('plots one point per week, labelled by week number', () => {
		const series = readGoalDistance(goalSeries);
		expect(series.points.map((p) => p.label)).toEqual(['28', '29', '30', '34', '39']);
		expect(series.axisLabel).toBe('Week number');
	});

	it('states the plan total the response gives, not the sum of its rows', () => {
		const series = readGoalDistance(goalSeries);
		expect(series.totalTodoKm).toBe(595.36);
		expect(series.totalDoneKm).toBe(159.69);
		// The series starts after the goal does, so the rows fall well short.
		const rowSum = series.points.reduce((sum, p) => sum + p.todoKm, 0);
		expect(rowSum).toBeLessThan(series.totalTodoKm);
	});

	it('reads a week with no completed distance as zero', () => {
		expect(readGoalDistance(goalSeries).points[4].doneKm).toBe(0);
	});

	it('marks the current week', () => {
		const current = readGoalDistance(goalSeries).points.filter((p) => p.isCurrent);
		expect(current.map((p) => p.label)).toEqual(['34']);
	});

	it('names the month in the tooltip label', () => {
		expect(readGoalDistance(goalSeries).points[0].fullLabel).toBe('Week 28 · August');
	});

	it('answers empty for missing stats rather than throwing', () => {
		const series = readGoalDistance(null);
		expect(series.points).toEqual([]);
		expect(series.axisLabel).toBe('Week number');
	});
});

describe('formatKm', () => {
	it('drops a trailing zero but keeps a real decimal', () => {
		expect(formatKm(8)).toBe('8 km');
		expect(formatKm(8.04)).toBe('8 km');
		expect(formatKm(36.94)).toBe('36.9 km');
		expect(formatKm(159.69)).toBe('159.7 km');
	});

	it('uses the unit it is given', () => {
		expect(formatKm(5, 'mi')).toBe('5 mi');
	});
});
