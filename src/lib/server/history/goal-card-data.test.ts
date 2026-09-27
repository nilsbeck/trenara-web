import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Goal, UserStats } from '$lib/server/trenara/types';
import { STORAGE_READ_MESSAGE } from '$lib/server/db/errors';

const mockGetUserPredictionHistory = vi.fn();
vi.mock('$lib/server/db/prediction-history', () => ({
	predictionHistoryDAO: {
		getUserPredictionHistory: (...args: unknown[]) => mockGetUserPredictionHistory(...args)
	}
}));

const mockGetForGoal = vi.fn();
vi.mock('$lib/server/db/goal-share', () => ({
	goalShareDAO: { getForGoal: (...args: unknown[]) => mockGetForGoal(...args) }
}));

import { readGoalChart, readGoalShare } from './goal-card-data';

const goal = { id: 7, start_date: '2026-01-06' } as Goal;
const stats = {
	best_times: { time_for_goal: '3:35:00', pace_for_goal: '5:06 min/km' }
} as unknown as UserStats;
const now = new Date('2026-09-27T08:00:00Z');

describe('readGoalChart', () => {
	beforeEach(() => {
		mockGetUserPredictionHistory.mockReset();
	});

	it("reads since the goal began, bounded, with today's reading laid over", async () => {
		mockGetUserPredictionHistory.mockResolvedValue([
			{ recorded_at: '2026-09-01', predicted_time: '3:40:00', predicted_pace: '5:13' }
		]);

		const chart = await readGoalChart(42, goal, stats, now);

		expect(mockGetUserPredictionHistory).toHaveBeenCalledWith(42, {
			startDate: '2026-01-06',
			limit: 200
		});
		expect(chart.error).toBeNull();
		expect(chart.records.map((p) => [p.date, p.formattedTime])).toEqual([
			['2026-09-01', '3:40:00'],
			['2026-09-27', '3:35:00']
		]);
	});

	it('reads everything when there is no goal', async () => {
		mockGetUserPredictionHistory.mockResolvedValue([]);
		await readGoalChart(42, null, null, now);
		expect(mockGetUserPredictionHistory).toHaveBeenCalledWith(42, {
			startDate: undefined,
			limit: 200
		});
	});

	it('reports a failed read inline rather than throwing', async () => {
		mockGetUserPredictionHistory.mockRejectedValue(new Error('down'));
		await expect(readGoalChart(42, goal, stats, now)).resolves.toEqual({
			records: [],
			error: STORAGE_READ_MESSAGE
		});
	});
});

describe('readGoalShare', () => {
	beforeEach(() => {
		mockGetForGoal.mockReset();
	});

	it('returns only the fields the button renders, never the row', async () => {
		mockGetForGoal.mockResolvedValue({
			token: 't'.repeat(43),
			title: 'Race day',
			user_id: 42,
			goal_id: 7,
			snapshot: { v: 1 }
		});

		await expect(readGoalShare(42, goal)).resolves.toEqual({
			token: 't'.repeat(43),
			title: 'Race day'
		});
		expect(mockGetForGoal).toHaveBeenCalledWith(42, 7);
	});

	it('is null without a goal, without a link, and on a failed read', async () => {
		await expect(readGoalShare(42, null)).resolves.toBeNull();
		expect(mockGetForGoal).not.toHaveBeenCalled();

		mockGetForGoal.mockResolvedValue(null);
		await expect(readGoalShare(42, goal)).resolves.toBeNull();

		mockGetForGoal.mockRejectedValue(new Error('down'));
		await expect(readGoalShare(42, goal)).resolves.toBeNull();
	});
});
