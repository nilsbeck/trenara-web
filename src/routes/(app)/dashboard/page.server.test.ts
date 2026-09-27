import { describe, it, expect, vi, beforeEach } from 'vitest';
import { load as rawLoad } from './+page.server';
import type { ChartDataPoint } from '$lib/components/charts/prediction-chart.svelte';

/** `PageServerLoad` admits `void`; this load never returns it. */
async function load(...args: Parameters<typeof rawLoad>) {
	const data = await rawLoad(...args);
	if (!data) throw new Error('load returned void');
	return data;
}

const mockGetSchedule = vi.fn();
const mockGetGoal = vi.fn();
const mockGetUserStats = vi.fn();
vi.mock('$lib/server/trenara', () => ({
	trainingApi: {
		getSchedule: (...args: unknown[]) => mockGetSchedule(...args),
		getGoal: (...args: unknown[]) => mockGetGoal(...args)
	},
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

const week = {
	id: 1,
	start_day: 0,
	start_day_long: '',
	training_week: 1,
	type: 'ultimate',
	trainings: [{ id: 1 }],
	strength_trainings: [],
	entries: []
};
const goal = { id: 7, name: 'Berlin Marathon', start_date: '2026-01-06' };
const stats = { best_times: { time_for_goal: '3:35:00', pace_for_goal: '5:06 min/km' } };

function makeEvent() {
	return {
		cookies: { get: () => undefined },
		locals: { user: { id: 42, email: '' } },
		isDataRequest: false
	} as unknown as Parameters<typeof rawLoad>[0];
}

describe('dashboard load', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockGetSchedule.mockResolvedValue(week);
		mockGetGoal.mockResolvedValue(goal);
		mockGetUserStats.mockResolvedValue(stats);
		mockGetUserPredictionHistory.mockResolvedValue([
			{ recorded_at: '2026-09-01', predicted_time: '3:40:00', predicted_pace: '5:13' }
		]);
		mockGetForGoal.mockResolvedValue({
			token: 't'.repeat(43),
			title: 'Race day',
			user_id: 42,
			goal_id: 7,
			snapshot: { v: 1 }
		});
	});

	it('answers without waiting for the history write, and hands it to afterResponse', async () => {
		// A write that never finishes: the old load awaited it and hung here.
		const pending = new Promise<void>(() => {});
		mockKeepHistory.mockReturnValue(pending);

		const data = await load(makeEvent());

		expect(data.schedule.trainings.length).toBeGreaterThan(0);
		expect(mockKeepHistory).toHaveBeenCalledWith(expect.anything(), 42);
		expect(mockAfterResponse).toHaveBeenCalledWith(pending);
	});

	it("lays today's reading over the stored chart, since the write has not landed", async () => {
		mockKeepHistory.mockReturnValue(new Promise(() => {}));

		const data = await load(makeEvent());

		expect(data.history.error).toBeNull();
		expect(data.history.records.map((p: ChartDataPoint) => p.formattedTime)).toEqual([
			'3:40:00',
			'3:35:00'
		]);
		expect(mockGetUserPredictionHistory).toHaveBeenCalledWith(42, {
			startDate: '2026-01-06',
			limit: 200
		});
	});

	it('sends only the share fields the button renders', async () => {
		mockKeepHistory.mockResolvedValue(undefined);

		const data = await load(makeEvent());

		expect(data.share).toEqual({ token: 't'.repeat(43), title: 'Race day' });
		expect(mockGetForGoal).toHaveBeenCalledWith(42, 7);
	});

	it('renders without a goal: no share read, the chart unfiltered', async () => {
		mockKeepHistory.mockResolvedValue(undefined);
		mockGetGoal.mockRejectedValue(new Error('No result found'));

		const data = await load(makeEvent());

		expect(data.goal).toBeNull();
		expect(data.share).toBeNull();
		expect(mockGetForGoal).not.toHaveBeenCalled();
		expect(mockGetUserPredictionHistory).toHaveBeenCalledWith(42, {
			startDate: undefined,
			limit: 200
		});
	});

	it('shows a failed chart read inline rather than failing the page', async () => {
		mockKeepHistory.mockResolvedValue(undefined);
		mockGetUserPredictionHistory.mockRejectedValue(new Error('down'));

		const data = await load(makeEvent());

		expect(data.history.records).toEqual([]);
		expect(data.history.error).toBeTruthy();
		expect(data.schedule).toBeTruthy();
	});
});
