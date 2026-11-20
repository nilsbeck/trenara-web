import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Goal, UserStats } from '#lib/server/trenara/types.js';
import { STORAGE_READ_MESSAGE } from '#lib/server/db/errors.js';

const mockGetUserPredictionHistory = vi.fn();
vi.mock('#lib/server/db/prediction-history.js', () => ({
	predictionHistoryDAO: {
		getUserPredictionHistory: (...args: unknown[]) => mockGetUserPredictionHistory(...args)
	}
}));

const mockListLive = vi.fn();
vi.mock('#lib/server/db/goal-share.js', () => ({
	goalShareDAO: { listLive: (...args: unknown[]) => mockListLive(...args) }
}));

import { readGoalChart, readGoalShare } from './goal-card-data';

const goal = { id: 7, start_date: '2026-01-06' } as Goal;
const stats = {
	best_times: { time_for_goal: '3:35:00', pace_for_goal: '5:06 min/km' }
} as unknown as UserStats;
const now = new Date('2026-09-27T08:00:00Z');

/** A read that has not answered yet, and the means to answer it. */
function pending<T>() {
	let answer!: (value: T) => void;
	const promise = new Promise<T>((resolve) => (answer = resolve));
	return { promise, answer };
}

describe('readGoalChart', () => {
	beforeEach(() => {
		mockGetUserPredictionHistory.mockReset();
	});

	it("keeps the rows since the goal began, with today's reading laid over", async () => {
		mockGetUserPredictionHistory.mockResolvedValue([
			{ recorded_at: '2025-12-30', predicted_time: '3:50:00', predicted_pace: '5:27' },
			{ recorded_at: '2026-01-06', predicted_time: '3:45:00', predicted_pace: '5:20' },
			{ recorded_at: '2026-09-01', predicted_time: '3:40:00', predicted_pace: '5:13' }
		]);

		const chart = await readGoalChart(42, goal, stats, now);

		expect(mockGetUserPredictionHistory).toHaveBeenCalledWith(42, {
			limit: 200,
			newestFirst: true
		});
		expect(chart.error).toBeNull();
		expect(chart.records.map((p) => [p.date, p.formattedTime])).toEqual([
			['2026-01-06', '3:45:00'],
			['2026-09-01', '3:40:00'],
			['2026-09-27', '3:35:00']
		]);
	});

	/**
	 * The query used to need the goal's start date, so it left only once the
	 * goal had answered and its round trip came after that one — the last
	 * thing to finish on the first measured preview load.
	 */
	it('asks the database before the goal has answered', async () => {
		mockGetUserPredictionHistory.mockResolvedValue([]);
		const goalRead = pending<Goal | null>();
		const statsRead = pending<UserStats | null>();

		const chart = readGoalChart(42, goalRead.promise, statsRead.promise, now);

		expect(mockGetUserPredictionHistory).toHaveBeenCalledTimes(1);
		goalRead.answer(goal);
		statsRead.answer(stats);
		await expect(chart).resolves.toMatchObject({ error: null });
	});

	it('keeps every row when there is no goal, or the goal could not be read', async () => {
		mockGetUserPredictionHistory.mockResolvedValue([
			{ recorded_at: '2025-12-30', predicted_time: '3:50:00', predicted_pace: '5:27' }
		]);

		const none = await readGoalChart(42, null, null, now);
		const failed = await readGoalChart(42, Promise.reject(new Error('down')), null, now);

		expect(none.records).toHaveLength(1);
		expect(failed.records).toHaveLength(1);
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
		mockListLive.mockReset();
	});

	it("returns only the fields the button renders, for this goal's link", async () => {
		mockListLive.mockResolvedValue([
			{ goal_id: 3, token: 'o'.repeat(43), title: 'Last spring' },
			{ goal_id: 7, token: 't'.repeat(43), title: 'Race day' }
		]);

		await expect(readGoalShare(42, goal)).resolves.toEqual({
			token: 't'.repeat(43),
			title: 'Race day'
		});
		expect(mockListLive).toHaveBeenCalledWith(42);
	});

	it('asks the database before the goal has answered', async () => {
		mockListLive.mockResolvedValue([]);
		const goalRead = pending<Goal | null>();

		const share = readGoalShare(42, goalRead.promise);

		expect(mockListLive).toHaveBeenCalledWith(42);
		goalRead.answer(goal);
		await expect(share).resolves.toBeNull();
	});

	it('is null without a goal, without a link for it, and on a failed read', async () => {
		mockListLive.mockResolvedValue([{ goal_id: 3, token: 'o'.repeat(43), title: null }]);
		await expect(readGoalShare(42, null)).resolves.toBeNull();
		await expect(readGoalShare(42, Promise.reject(new Error('down')))).resolves.toBeNull();
		await expect(readGoalShare(42, goal)).resolves.toBeNull();

		mockListLive.mockRejectedValue(new Error('down'));
		await expect(readGoalShare(42, goal)).resolves.toBeNull();
	});
});
