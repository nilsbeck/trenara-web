import { describe, it, expect, vi, beforeEach } from 'vitest';
import { load as rawLoad } from './+page.server';
import type { ChartDataPoint } from '$lib/components/charts/prediction-chart.svelte';

/** `PageServerLoad` admits `void`; this load never returns it. */
async function load(...args: Parameters<typeof rawLoad>) {
	const data = await rawLoad(...args);
	if (!data) throw new Error('load returned void');
	return data;
}

const mockGetGoal = vi.fn();
const mockGetUserStats = vi.fn();
vi.mock('$lib/server/trenara', () => ({
	trainingApi: { getGoal: (...args: unknown[]) => mockGetGoal(...args) },
	userApi: { getUserStats: (...args: unknown[]) => mockGetUserStats(...args) }
}));

const mockKeepHistory = vi.fn();
vi.mock('$lib/server/history/record', () => ({
	keepHistory: (...args: unknown[]) => mockKeepHistory(...args)
}));

const mockAfterResponse = vi.fn();
vi.mock('$lib/server/after-response', () => ({
	afterResponse: (...args: unknown[]) => mockAfterResponse(...args)
}));

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

function makeEvent() {
	return {
		cookies: { get: () => undefined },
		locals: { user: { id: 42, email: '' } }
	} as unknown as Parameters<typeof rawLoad>[0];
}

describe('goal load', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockGetGoal.mockResolvedValue({ id: 7, start_date: '2026-01-06' });
		mockGetUserStats.mockResolvedValue({
			best_times: { time_for_goal: '3:35:00', pace_for_goal: '5:06 min/km' }
		});
		mockGetUserPredictionHistory.mockResolvedValue([]);
		mockGetForGoal.mockResolvedValue({ token: 't'.repeat(43), title: 'Race day', user_id: 42 });
	});

	it('settles the chart and share without waiting for the history write', async () => {
		// A write that never finishes: the chart used to wait for it.
		const pending = new Promise<void>(() => {});
		mockKeepHistory.mockReturnValue(pending);

		const data = await load(makeEvent());

		const [history, share] = await Promise.all([data.history, data.share]);
		expect(history.records.map((p: ChartDataPoint) => p.formattedTime)).toEqual(['3:35:00']);
		expect(share).toEqual({ token: 't'.repeat(43), title: 'Race day' });
		expect(mockAfterResponse).toHaveBeenCalledWith(pending);
	});
});
