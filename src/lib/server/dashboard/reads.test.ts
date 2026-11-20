import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Cookies } from '@sveltejs/kit';
import { NetworkError } from '#lib/server/trenara/client.js';
import { startDashboardReads } from './reads';

const mockGetSchedule = vi.fn();
const mockGetGoal = vi.fn();
const mockGetUserStats = vi.fn();
vi.mock('#lib/server/trenara/index.js', () => ({
	trainingApi: {
		getSchedule: (...args: unknown[]) => mockGetSchedule(...args),
		getGoal: (...args: unknown[]) => mockGetGoal(...args)
	},
	userApi: { getUserStats: (...args: unknown[]) => mockGetUserStats(...args) }
}));

const cookies = { get: () => undefined } as unknown as Cookies;

function week(id: number) {
	return {
		id,
		start_day: 0,
		start_day_long: '',
		training_week: 1,
		type: 'ultimate',
		trainings: [{ id }],
		strength_trainings: [],
		entries: [{ id }]
	};
}

beforeEach(() => vi.clearAllMocks());

describe('startDashboardReads', () => {
	it('merges every week of the month into one schedule', async () => {
		let n = 0;
		mockGetSchedule.mockImplementation(async () => week(++n));
		mockGetGoal.mockResolvedValue({ id: 7 });
		mockGetUserStats.mockResolvedValue({ best_times: {} });

		const reads = startDashboardReads(cookies, { fresh: true }, { user: null });
		const schedule = await reads.schedule;

		expect(schedule.trainings.length).toBe(mockGetSchedule.mock.calls.length);
		expect(schedule.trainings.length).toBeGreaterThanOrEqual(4);
		expect(mockGetSchedule.mock.calls.every(([, , options]) => options.fresh === true)).toBe(true);
		await expect(reads.goal).resolves.toEqual({ id: 7 });
	});

	/**
	 * The hook may start these and then never let the page run — a token
	 * Trenara refuses sends the runner to sign in instead. A rejection nobody
	 * awaits would then be an unhandled one, which Node treats as fatal.
	 */
	it('leaves no rejection unhandled when nobody ever awaits it', async () => {
		mockGetSchedule.mockRejectedValue(new NetworkError('fetch failed'));
		mockGetGoal.mockRejectedValue(new NetworkError('fetch failed'));
		mockGetUserStats.mockRejectedValue(new NetworkError('fetch failed'));

		startDashboardReads(cookies, { fresh: true }, { user: null });

		// Vitest fails the run on an unhandled rejection; settling is the check.
		await new Promise((resolve) => setTimeout(resolve, 0));
	});

	it('still hands the schedule failure to whoever awaits it, with a status', async () => {
		mockGetSchedule.mockRejectedValue(new NetworkError('fetch failed'));
		mockGetGoal.mockRejectedValue(new NetworkError('fetch failed'));
		mockGetUserStats.mockRejectedValue(new NetworkError('fetch failed'));

		const reads = startDashboardReads(cookies, { fresh: false }, { user: null });

		await expect(reads.schedule).rejects.toMatchObject({ status: expect.any(Number) });
		await expect(reads.goal).resolves.toBeNull();
		await expect(reads.stats).resolves.toBeNull();
	});
});
