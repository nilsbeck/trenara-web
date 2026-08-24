import { describe, it, expect } from 'vitest';
import { entryLocalDate, mergeSchedule } from './schedule';
import type {
	Entry,
	Schedule,
	ScheduledTraining,
	StrengthTraining
} from '$lib/server/trenara/types';

function training(id: number, day: string): ScheduledTraining {
	return { id, day_long: day, title: `Run ${id}` } as unknown as ScheduledTraining;
}

function strength(id: number, day: string): StrengthTraining {
	return { id, day, title: `Core ${id}` } as unknown as StrengthTraining;
}

function entry(id: number, day: string): Entry {
	return { id, start_time: `${day}T08:00:00.000Z`, type: 'run' } as unknown as Entry;
}

function schedule(overrides: Partial<Schedule> = {}): Schedule {
	return {
		id: 0,
		start_day: 0,
		start_day_long: '',
		training_week: 0,
		type: 'ultimate',
		trainings: [],
		strength_trainings: [],
		entries: [],
		...overrides
	};
}

describe('entryLocalDate', () => {
	it('reads an ISO instant as a local day', () => {
		expect(entryLocalDate('2025-03-05T08:00:00.000Z')).toMatch(/^2025-03-0[45]$/);
	});
});

describe('mergeSchedule', () => {
	it('keeps the days the server was not asked about', () => {
		const cached = schedule({ trainings: [training(1, '2025-03-03'), training(2, '2025-03-20')] });
		const incoming = schedule({ trainings: [training(2, '2025-03-20')] });

		const merged = mergeSchedule(cached, incoming, '2025-03-17');

		expect(merged.trainings.map((t) => t.id)).toEqual([1, 2]);
	});

	it('drops a session deleted from a week the server did answer for', () => {
		const cached = schedule({ trainings: [training(1, '2025-03-03'), training(2, '2025-03-20')] });
		const incoming = schedule({ trainings: [] });

		const merged = mergeSchedule(cached, incoming, '2025-03-17');

		// The old week survives; the answered week is replaced, absences included.
		expect(merged.trainings.map((t) => t.id)).toEqual([1]);
	});

	it('takes the newer copy of a session that moved within the covered range', () => {
		const cached = schedule({ trainings: [training(2, '2025-03-20')] });
		const incoming = schedule({ trainings: [training(2, '2025-03-22')] });

		const merged = mergeSchedule(cached, incoming, '2025-03-17');

		expect(merged.trainings).toHaveLength(1);
		expect(merged.trainings[0].day_long).toBe('2025-03-22');
	});

	it('merges strength sessions on the same boundary', () => {
		const cached = schedule({
			strength_trainings: [strength(1, '2025-03-03'), strength(2, '2025-03-20')]
		});
		const incoming = schedule({ strength_trainings: [strength(3, '2025-03-21')] });

		const merged = mergeSchedule(cached, incoming, '2025-03-17');

		expect(merged.strength_trainings.map((s) => s.id)).toEqual([1, 3]);
	});

	it('merges completed entries on the same boundary', () => {
		const cached = schedule({ entries: [entry(1, '2025-03-03'), entry(2, '2025-03-20')] });
		const incoming = schedule({ entries: [entry(2, '2025-03-20'), entry(3, '2025-03-21')] });

		const merged = mergeSchedule(cached, incoming, '2025-03-17');

		expect(merged.entries.map((e) => e.id)).toEqual([1, 2, 3]);
	});

	it('leaves a month untouched when nothing changed', () => {
		const cached = schedule({ trainings: [training(1, '2025-03-03'), training(2, '2025-03-20')] });
		const incoming = schedule({ trainings: [training(2, '2025-03-20')] });

		const merged = mergeSchedule(cached, incoming, '2025-03-17');

		expect(JSON.stringify(merged.trainings)).toBe(JSON.stringify(cached.trainings));
	});

	it('is stable, so an unchanged month merges to the same shape twice', () => {
		const cached = schedule({ trainings: [training(1, '2025-03-03'), training(2, '2025-03-20')] });
		const incoming = schedule({ trainings: [training(2, '2025-03-20')] });

		const once = mergeSchedule(cached, incoming, '2025-03-17');
		const twice = mergeSchedule(once, incoming, '2025-03-17');

		expect(JSON.stringify(twice)).toBe(JSON.stringify(once));
	});

	it('takes everything when the boundary predates the whole month', () => {
		const cached = schedule({ trainings: [training(1, '2025-03-03')] });
		const incoming = schedule({ trainings: [training(9, '2025-03-05')] });

		const merged = mergeSchedule(cached, incoming, '2025-02-24');

		expect(merged.trainings.map((t) => t.id)).toEqual([9]);
	});

	it('survives a cached month with missing arrays', () => {
		const cached = { ...schedule(), trainings: undefined } as unknown as Schedule;
		const incoming = schedule({ trainings: [training(1, '2025-03-20')] });

		expect(mergeSchedule(cached, incoming, '2025-03-17').trainings.map((t) => t.id)).toEqual([1]);
	});
});
