import { describe, it, expect } from 'vitest';
import { trainingLoad } from './training-load';
import type { Entry } from '$lib/server/trenara/types';

function entryWith(metadata: unknown): Entry {
	return { notification: { metadata } } as unknown as Entry;
}

describe('trainingLoad', () => {
	it('reads what the session earned against what the day asked', () => {
		const load = trainingLoad(
			entryWith({ goal_daily_tss: 45.4991, goal_pvt_tss: 45, done_tss: 36.9671 })
		);

		expect(load).toEqual({ done: 37, goal: 45, ratio: 36.9671 / 45.4991 });
	});

	it('treats going over as an ordinary outcome', () => {
		const load = trainingLoad(entryWith({ goal_daily_tss: 40, done_tss: 52 }));
		expect(load?.ratio).toBeGreaterThan(1);
	});

	it('says nothing when the notification is not about a training', () => {
		// A medal notification carries a different metadata shape, and the
		// add-entry response's is typed without the load fields at all.
		expect(trainingLoad(entryWith({ name: 'Nils', goal: '15k', type: 'medal' }))).toBeNull();
		expect(trainingLoad(entryWith({ done_tss: 37 }))).toBeNull();
		expect(trainingLoad(entryWith({ done_tss: '37', goal_daily_tss: '45' }))).toBeNull();
	});

	it('says nothing when there is no notification at all', () => {
		expect(trainingLoad(null)).toBeNull();
		expect(trainingLoad(undefined)).toBeNull();
		expect(trainingLoad({ notification: null } as unknown as Entry)).toBeNull();
	});

	it('refuses to divide by a target of zero', () => {
		expect(trainingLoad(entryWith({ goal_daily_tss: 0, done_tss: 12 }))).toBeNull();
	});
});
