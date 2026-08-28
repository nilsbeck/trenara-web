import { describe, it, expect } from 'vitest';
import { initialCalendarDay } from './initial-day';
import type { Entry, Schedule, StrengthTraining } from '$lib/server/trenara/types';

// Wednesday 2026-08-26.
const TODAY = new Date(2026, 7, 26, 14, 30);

function training(day: string) {
	return { id: 1, day_long: `${day} 00:00:00` } as Schedule['trainings'][number];
}

function strength(day: string) {
	return { id: 2, day: `${day} 00:00:00` } as StrengthTraining;
}

function entry(day: string, { rpe, at = '09:00:00' }: { rpe: number | null; at?: string }) {
	return { id: 3, type: 'run', start_time: `${day}T${at}+02:00`, rpe } as Entry;
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

function asString(date: Date): string {
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

describe('initialCalendarDay', () => {
	it('falls back to today without a schedule', () => {
		expect(asString(initialCalendarDay(null, TODAY))).toBe('2026-08-26');
	});

	it('returns local midnight, not the time of day it was asked at', () => {
		const day = initialCalendarDay(null, TODAY);
		expect(day.getHours()).toBe(0);
		expect(day.getMinutes()).toBe(0);
	});

	it('opens on the last completed run when it has no RPE yet', () => {
		const result = initialCalendarDay(
			schedule({
				trainings: [training('2026-08-25'), training('2026-08-28')],
				entries: [entry('2026-08-25', { rpe: null })]
			}),
			TODAY
		);
		expect(asString(result)).toBe('2026-08-25');
	});

	it('ignores a rated run and moves on to the rest of the rules', () => {
		const result = initialCalendarDay(
			schedule({
				trainings: [training('2026-08-25'), training('2026-08-28')],
				entries: [entry('2026-08-25', { rpe: 6 })]
			}),
			TODAY
		);
		expect(asString(result)).toBe('2026-08-28');
	});

	it('only looks at the most recent run, not every unrated one behind it', () => {
		const result = initialCalendarDay(
			schedule({
				trainings: [training('2026-08-28')],
				entries: [entry('2026-08-20', { rpe: null }), entry('2026-08-25', { rpe: 4 })]
			}),
			TODAY
		);
		expect(asString(result)).toBe('2026-08-28');
	});

	it('takes the later of two runs on the same day', () => {
		const result = initialCalendarDay(
			schedule({
				trainings: [training('2026-08-28')],
				entries: [
					entry('2026-08-25', { rpe: null, at: '07:00:00' }),
					entry('2026-08-25', { rpe: 5, at: '18:00:00' })
				]
			}),
			TODAY
		);
		expect(asString(result)).toBe('2026-08-28');
	});

	it('does not treat a run logged later today as the last completed one', () => {
		const result = initialCalendarDay(
			schedule({
				entries: [entry('2026-08-24', { rpe: null }), entry('2026-08-30', { rpe: null })]
			}),
			TODAY
		);
		expect(asString(result)).toBe('2026-08-24');
	});

	it('ignores strength entries when looking for a rating', () => {
		const result = initialCalendarDay(
			schedule({
				trainings: [training('2026-08-28')],
				entries: [{ id: 9, type: 'strength', start_time: '2026-08-25T09:00:00+02:00' } as Entry]
			}),
			TODAY
		);
		expect(asString(result)).toBe('2026-08-28');
	});

	it('opens on today when today has a planned run', () => {
		const result = initialCalendarDay(
			schedule({ trainings: [training('2026-08-26'), training('2026-08-29')] }),
			TODAY
		);
		expect(asString(result)).toBe('2026-08-26');
	});

	it('opens on today when today only has strength planned', () => {
		const result = initialCalendarDay(
			schedule({
				strength_trainings: [strength('2026-08-26')],
				trainings: [training('2026-08-29')]
			}),
			TODAY
		);
		expect(asString(result)).toBe('2026-08-26');
	});

	it('opens on today when a rated run was logged on it', () => {
		const result = initialCalendarDay(
			schedule({
				trainings: [training('2026-08-29')],
				entries: [entry('2026-08-26', { rpe: 7 })]
			}),
			TODAY
		);
		expect(asString(result)).toBe('2026-08-26');
	});

	it('skips an empty today for the next planned session', () => {
		const result = initialCalendarDay(
			schedule({ trainings: [training('2026-08-24'), training('2026-08-29')] }),
			TODAY
		);
		expect(asString(result)).toBe('2026-08-29');
	});

	it('takes the nearest of the sessions ahead, whichever kind it is', () => {
		const result = initialCalendarDay(
			schedule({
				trainings: [training('2026-08-30')],
				strength_trainings: [strength('2026-08-27')]
			}),
			TODAY
		);
		expect(asString(result)).toBe('2026-08-27');
	});

	it('stays on today when nothing is planned ahead', () => {
		const result = initialCalendarDay(
			schedule({
				trainings: [training('2026-08-24')],
				entries: [entry('2026-08-24', { rpe: 5 })]
			}),
			TODAY
		);
		expect(asString(result)).toBe('2026-08-26');
	});

	it('stays on today when the schedule is empty', () => {
		expect(asString(initialCalendarDay(schedule({}), TODAY))).toBe('2026-08-26');
	});
});
