import { describe, it, expect } from 'vitest';
import { readGoalSummary, shortenPaceUnit, weeksRemaining } from './goal-summary';
import type { Goal, UserStats } from '$lib/server/trenara/types';

const NOW = new Date('2026-08-29T12:00:00Z');

function goal(overrides: Partial<Goal> = {}): Goal {
	return {
		name: 'Berlin Marathon',
		start_date: '2026-06-01',
		end_date: '2026-10-31',
		distance: '42.2 km',
		distance_value: 42.2,
		time: '3:30:00',
		time_in_sec: 12600,
		pace: '4:58 min/km',
		...overrides
	} as unknown as Goal;
}

function stats(best: Partial<UserStats['best_times']> = {}): UserStats {
	return {
		best_times: {
			time_for_goal: '3:42:15',
			pace_for_goal: '5:16 min/km',
			...best
		}
	} as unknown as UserStats;
}

describe('weeksRemaining', () => {
	it('rounds a part-week up, so the last days still read as a week', () => {
		expect(weeksRemaining(new Date('2026-09-01T12:00:00Z'), NOW)).toBe(1);
	});

	it('counts whole weeks exactly', () => {
		expect(weeksRemaining(new Date('2026-09-19T12:00:00Z'), NOW)).toBe(3);
	});

	it('floors at zero rather than counting backwards past race day', () => {
		expect(weeksRemaining(new Date('2026-07-01T12:00:00Z'), NOW)).toBe(0);
	});
});

describe('shortenPaceUnit', () => {
	it('drops the "min" the strip has no room for', () => {
		expect(shortenPaceUnit('5:16 min/km')).toBe('5:16 /km');
	});

	it('keeps whatever unit the account actually uses', () => {
		expect(shortenPaceUnit('8:29 min/mi')).toBe('8:29 /mi');
	});

	it('leaves a pace that carries no unit alone', () => {
		expect(shortenPaceUnit('5:16')).toBe('5:16');
	});
});

describe('readGoalSummary', () => {
	it('reads the name, the countdown and the live prediction', () => {
		expect(readGoalSummary(goal(), stats(), NOW)).toEqual({
			name: 'Berlin Marathon',
			distance: '42.2 km',
			weeks: 9,
			isPast: false,
			predictedTime: '3:42:15',
			predictedPace: '5:16 /km'
		});
	});

	it('marks a goal whose race day has gone by', () => {
		const summary = readGoalSummary(goal({ end_date: '2026-08-01' }), stats(), NOW);
		expect(summary).toMatchObject({ isPast: true, weeks: 0 });
	});

	it('leaves race day itself as a live goal', () => {
		// `end_date` has no time of day, so it parses to midnight — the whole of
		// race day reads as past unless the comparison is against its start.
		const summary = readGoalSummary(goal({ end_date: '2026-08-30' }), stats(), NOW);
		expect(summary).toMatchObject({ isPast: false, weeks: 1 });
	});

	it('reports a missing prediction as absent rather than as an empty string', () => {
		const summary = readGoalSummary(
			goal(),
			stats({ time_for_goal: '', pace_for_goal: undefined as unknown as string }),
			NOW
		);
		expect(summary).toMatchObject({ predictedTime: null, predictedPace: null });
	});

	it('survives stats that arrived without a best_times block at all', () => {
		const summary = readGoalSummary(goal(), {} as UserStats, NOW);
		expect(summary).toMatchObject({ name: 'Berlin Marathon', predictedTime: null });
	});

	it('reports a goal that arrived without a distance as having none', () => {
		expect(readGoalSummary(goal({ distance: '' }), stats(), NOW)).toMatchObject({
			distance: null
		});
	});

	it('has nothing to say without a goal', () => {
		expect(readGoalSummary(null, stats(), NOW)).toBeNull();
		expect(readGoalSummary(goal({ end_date: '' }), stats(), NOW)).toBeNull();
	});

	it('refuses an unparseable race day rather than rendering "NaN weeks"', () => {
		expect(readGoalSummary(goal({ end_date: 'not a date' }), stats(), NOW)).toBeNull();
	});
});
