import { describe, it, expect } from 'vitest';
import { hasAnyRing, hasRing, readWeekProgress, ringFraction } from './week-progress';
import type { Entry, Schedule, StrengthTraining, UserStats } from '$lib/server/trenara/types';

type WeekSeries = UserStats['graph_stats']['weeks'];

// Monday 2026-08-24 .. Sunday 2026-08-30.
const MONDAY = new Date(2026, 7, 24);

function training(day: string) {
	return { id: 1, day_long: `${day} 00:00:00` } as Schedule['trainings'][number];
}

function strength(day: string) {
	return { id: 2, day: `${day} 00:00:00` } as StrengthTraining;
}

function entry(day: string, type: string) {
	return { id: 3, type, start_time: `${day}T09:00:00+02:00` } as Entry;
}

function schedule(partial: Partial<Schedule>): Schedule {
	return {
		id: 0,
		start_day: 0,
		start_day_long: '',
		training_week: 0,
		type: 'ultimate',
		trainings: [],
		strength_trainings: [],
		entries: [],
		...partial
	};
}

const weekSeries = {
	data: [],
	done: '8km',
	done_value: 8,
	done_unit: 'km',
	done_unit_text: 'km',
	todo: '36.94km',
	todo_value: 36.94,
	todo_unit: 'km',
	todo_unit_text: 'km'
} as unknown as WeekSeries;

describe('readWeekProgress', () => {
	it('counts the runs planned and the runs filed', () => {
		const progress = readWeekProgress(
			schedule({
				trainings: [
					training('2026-08-24'),
					training('2026-08-26'),
					training('2026-08-28'),
					training('2026-08-30')
				],
				entries: [entry('2026-08-24', 'run')]
			}),
			weekSeries,
			MONDAY
		);
		expect(progress.sessions).toEqual({ done: 1, planned: 4 });
	});

	it('ignores days outside the Monday–Sunday window', () => {
		const progress = readWeekProgress(
			schedule({
				// Sunday before, and the Monday after.
				trainings: [training('2026-08-23'), training('2026-08-24'), training('2026-08-31')],
				entries: [entry('2026-08-23', 'run'), entry('2026-08-24', 'run')]
			}),
			weekSeries,
			MONDAY
		);
		expect(progress.sessions).toEqual({ done: 1, planned: 1 });
	});

	it('counts from any day of the week, not just Monday', () => {
		const plan = schedule({
			trainings: [training('2026-08-24'), training('2026-08-28')],
			entries: [entry('2026-08-24', 'run')]
		});
		const sunday = new Date(2026, 7, 30);
		expect(readWeekProgress(plan, weekSeries, sunday).sessions).toEqual({ done: 1, planned: 2 });
	});

	it('separates strength from runs', () => {
		const progress = readWeekProgress(
			schedule({
				trainings: [training('2026-08-24')],
				strength_trainings: [strength('2026-08-25'), strength('2026-08-27')],
				entries: [entry('2026-08-24', 'run'), entry('2026-08-25', 'strength')]
			}),
			weekSeries,
			MONDAY
		);
		expect(progress.sessions).toEqual({ done: 1, planned: 1 });
		expect(progress.strength).toEqual({ done: 1, planned: 2 });
	});

	it('reports an unplanned extra run rather than showing more done than planned', () => {
		const progress = readWeekProgress(
			schedule({
				trainings: [training('2026-08-24')],
				entries: [entry('2026-08-24', 'run'), entry('2026-08-26', 'run')]
			}),
			weekSeries,
			MONDAY
		);
		expect(progress.sessions).toEqual({ done: 2, planned: 2 });
	});

	it('takes distance from the stats totals, not from the schedule', () => {
		const progress = readWeekProgress(schedule({}), weekSeries, MONDAY);
		expect(progress.distance).toEqual({ doneKm: 8, plannedKm: 36.94, unit: 'km' });
	});

	it('reads a week with nothing at all as all zeroes', () => {
		const progress = readWeekProgress(null, null, MONDAY);
		expect(progress.sessions).toEqual({ done: 0, planned: 0 });
		expect(progress.strength).toEqual({ done: 0, planned: 0 });
		expect(progress.distance).toEqual({ doneKm: 0, plannedKm: 0, unit: 'km' });
	});

	it('keeps the unit the API sent', () => {
		const miles = { ...weekSeries, todo_unit: 'mi', done_unit: 'mi' } as WeekSeries;
		expect(readWeekProgress(null, miles, MONDAY).distance.unit).toBe('mi');
	});
});

describe('ringFraction', () => {
	it('is empty when nothing is planned and nothing done', () => {
		expect(ringFraction(0, 0)).toBe(0);
	});

	it('is full for work done against no plan', () => {
		expect(ringFraction(2, 0)).toBe(1);
	});

	it('clamps over-delivery at full', () => {
		expect(ringFraction(5, 4)).toBe(1);
	});

	it('is the plain ratio in between', () => {
		expect(ringFraction(1, 4)).toBe(0.25);
	});
});

describe('hasRing', () => {
	it('drops a ring with nothing planned and nothing done', () => {
		expect(hasRing(0, 0)).toBe(false);
	});

	it('keeps a ring with work planned, even before any of it is done', () => {
		expect(hasRing(0, 4)).toBe(true);
	});

	it('keeps a ring for an unplanned session — a run off the plan is still a run', () => {
		expect(hasRing(1, 0)).toBe(true);
	});

	it('keeps a fractional distance below one', () => {
		expect(hasRing(0, 0.4)).toBe(true);
	});
});

describe('hasAnyRing', () => {
	const empty = {
		sessions: { done: 0, planned: 0 },
		distance: { doneKm: 0, plannedKm: 0, unit: 'km' },
		strength: { done: 0, planned: 0 }
	};

	it('is false for a week with nothing at all, so the navbar shows nothing', () => {
		expect(hasAnyRing(empty)).toBe(false);
	});

	it('is false for no progress at all', () => {
		expect(hasAnyRing(null)).toBe(false);
		expect(hasAnyRing(undefined)).toBe(false);
	});

	it('is true when a single ring survives', () => {
		expect(hasAnyRing({ ...empty, strength: { done: 0, planned: 2 } })).toBe(true);
		expect(hasAnyRing({ ...empty, distance: { doneKm: 8, plannedKm: 0, unit: 'km' } })).toBe(true);
	});
});
