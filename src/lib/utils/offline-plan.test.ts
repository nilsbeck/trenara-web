import { describe, it, expect, beforeEach } from 'vitest';
import type { Goal, Schedule, UserStats } from '#lib/server/trenara/types.js';
import {
	OFFLINE_CARDS_KEY,
	OFFLINE_PLAN_KEY,
	readOfflineCards,
	saveOfflineCards,
	buildOfflinePlan,
	clearOfflinePlan,
	formatSavedAt,
	hasOfflinePlan,
	monthStart,
	readOfflinePlan,
	saveOfflinePlan,
	type OfflinePlan
} from './offline-plan';

function month(id: number): Schedule {
	return {
		id,
		start_day: 0,
		start_day_long: '2026-11-23',
		training_week: 48,
		type: 'ultimate',
		trainings: [],
		strength_trainings: [],
		entries: []
	};
}

beforeEach(() => {
	localStorage.clear();
});

describe('buildOfflinePlan', () => {
	it('keeps the months as the calendar holds them', () => {
		const plan = buildOfflinePlan([
			{ month: '2026-11', schedule: month(1), fetchedAt: 9_000 },
			{ month: '2026-12', schedule: month(2), fetchedAt: 9_500 }
		]);

		expect(plan?.months).toEqual([
			{ month: '2026-11', schedule: month(1) },
			{ month: '2026-12', schedule: month(2) }
		]);
	});

	it('dates the plan by its oldest month, never claiming it fresher than it is', () => {
		const plan = buildOfflinePlan([
			{ month: '2026-11', schedule: month(1), fetchedAt: 9_000 },
			{ month: '2026-12', schedule: month(2), fetchedAt: 4_000 }
		]);

		expect(plan!.savedAt).toBe(4_000);
	});

	it('is null when there is nothing to keep', () => {
		expect(buildOfflinePlan([])).toBeNull();
	});
});

describe('saving and reading back', () => {
	const plan: OfflinePlan = {
		version: 2,
		savedAt: 1_764_000_000_000,
		months: [{ month: '2026-11', schedule: month(1) }]
	};

	it('reads back what was saved', () => {
		saveOfflinePlan(plan);

		expect(readOfflinePlan()).toEqual(plan);
		expect(hasOfflinePlan()).toBe(true);
	});

	it('forgets it when cleared', () => {
		saveOfflinePlan(plan);
		clearOfflinePlan();

		expect(readOfflinePlan()).toBeNull();
		expect(hasOfflinePlan()).toBe(false);
	});

	it('reads nothing when nothing was saved', () => {
		expect(readOfflinePlan()).toBeNull();
		expect(hasOfflinePlan()).toBe(false);
	});

	it('ignores a plan written in another version of the shape', () => {
		localStorage.setItem(OFFLINE_PLAN_KEY, JSON.stringify({ ...plan, version: 1 }));

		expect(readOfflinePlan()).toBeNull();
	});

	it('ignores what is not JSON at all', () => {
		localStorage.setItem(OFFLINE_PLAN_KEY, '{not json');

		expect(readOfflinePlan()).toBeNull();
	});

	it('ignores a plan with no readable time', () => {
		localStorage.setItem(OFFLINE_PLAN_KEY, JSON.stringify({ ...plan, savedAt: 'yesterday' }));

		expect(readOfflinePlan()).toBeNull();
	});

	// The store walks the three lists without checking them, so a month without
	// them would take the calendar down rather than draw nothing.
	it('drops a month the calendar could not index', () => {
		const { entries: _dropped, ...noEntries } = month(2);
		localStorage.setItem(
			OFFLINE_PLAN_KEY,
			JSON.stringify({
				...plan,
				months: [
					plan.months[0],
					{ month: '2026-12', schedule: noEntries },
					{ month: 'December', schedule: month(3) },
					{ month: '2027-01', schedule: null }
				]
			})
		);

		expect(readOfflinePlan()?.months).toEqual(plan.months);
	});

	it('reads a plan with no usable month as no plan', () => {
		localStorage.setItem(
			OFFLINE_PLAN_KEY,
			JSON.stringify({ ...plan, months: [{ month: '2026-13', schedule: month(1) }] })
		);

		expect(readOfflinePlan()).toBeNull();
	});
});

describe('helpers', () => {
	it('finds the first of a month as a local day', () => {
		expect(monthStart('2026-11')).toEqual(new Date(2026, 10, 1));
	});

	it('states when the plan was saved, to the minute', () => {
		expect(formatSavedAt(new Date(2026, 10, 24, 18, 42).getTime())).toBe('Tue, Nov 24, 6:42 PM');
	});
});

describe("the goal card's copy", () => {
	const goal = { id: 7, name: 'Valencia 42k' } as Goal;
	const userStats = { best_times: { time_for_goal: '3:03:36' } } as unknown as UserStats;
	const point = {
		date: '2026-11-24',
		predictedTime: 11_016,
		predictedPace: 261,
		formattedTime: '3:03:36',
		formattedPace: '4:21'
	};

	it('reads back what was saved', () => {
		saveOfflineCards({ savedAt: 5, goal, userStats, history: [point] });

		expect(readOfflineCards()).toEqual({
			version: 1,
			savedAt: 5,
			goal,
			userStats,
			history: [point]
		});
	});

	it('keeps an account with no goal', () => {
		saveOfflineCards({ savedAt: 5, goal: null, userStats, history: [] });

		expect(readOfflineCards()?.goal).toBeNull();
	});

	// The dashboard says "Some data could not be loaded" for these; keeping
	// that over a good copy would leave the offline page worse off.
	it('does not replace a good copy with stats that would not draw', () => {
		saveOfflineCards({ savedAt: 5, goal, userStats, history: [] });
		saveOfflineCards({ savedAt: 9, goal, userStats: null, history: [] });

		expect(readOfflineCards()?.savedAt).toBe(5);
	});

	it('drops chart points it could not plot', () => {
		localStorage.setItem(
			OFFLINE_CARDS_KEY,
			JSON.stringify({
				version: 1,
				savedAt: 5,
				goal,
				userStats,
				history: [point, { date: '2026-11-25' }, null]
			})
		);

		expect(readOfflineCards()?.history).toEqual([point]);
	});

	it('ignores a copy whose goal or stats it cannot read', () => {
		const base = { version: 1, savedAt: 5, goal, userStats, history: [] };
		for (const broken of [
			{ ...base, goal: 'Valencia' },
			{ ...base, userStats: {} },
			{ ...base, savedAt: null },
			{ ...base, version: 2 }
		]) {
			localStorage.setItem(OFFLINE_CARDS_KEY, JSON.stringify(broken));
			expect(readOfflineCards()).toBeNull();
		}
	});

	it('goes with the plan on logout', () => {
		saveOfflineCards({ savedAt: 5, goal, userStats, history: [] });
		clearOfflinePlan();

		expect(readOfflineCards()).toBeNull();
	});
});
