import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Goal, UserStats } from '$lib/server/trenara/types';
import { refreshShareSnapshot } from './refresh';

const mockRefreshSnapshot = vi.hoisted(() => vi.fn());

vi.mock('$lib/server/db/goal-share', () => ({
	goalShareDAO: { refreshSnapshot: mockRefreshSnapshot }
}));

const goal = {
	id: 7,
	name: 'Berlin Marathon',
	start_date: '2026-01-06',
	end_date: '2026-09-27',
	distance: '42.195 km',
	distance_unit: 'km',
	distance_value: 42.195,
	time: '3:30:00',
	time_in_sec: 12600,
	pace: '5:00 min/km'
} as unknown as Goal;

const stats = {
	best_times: { time_for_goal: '3:35:00', pace_for_goal: '5:06 min/km' },
	graph_stats: {
		goal: {
			data: [],
			done: '0 km',
			done_value: 0,
			done_unit: 'km',
			done_unit_text: 'km',
			todo: '0 km',
			todo_value: 0,
			todo_unit: 'km',
			todo_unit_text: 'km'
		}
	}
} as unknown as UserStats;

beforeEach(() => {
	vi.clearAllMocks();
	mockRefreshSnapshot.mockResolvedValue({ written: false });
});

describe('refreshShareSnapshot', () => {
	it('writes nothing when there is no goal', async () => {
		await refreshShareSnapshot(42, null, stats);
		expect(mockRefreshSnapshot).not.toHaveBeenCalled();
	});

	it('writes nothing when there are no stats', async () => {
		await refreshShareSnapshot(42, goal, null);
		expect(mockRefreshSnapshot).not.toHaveBeenCalled();
	});

	it('writes nothing when the goal and stats do not project a usable snapshot', async () => {
		const bareStats = { best_times: {} } as unknown as UserStats;
		await refreshShareSnapshot(42, goal, bareStats);
		expect(mockRefreshSnapshot).not.toHaveBeenCalled();
	});

	it('writes the projected snapshot against the goal id, for a live link', async () => {
		await refreshShareSnapshot(42, goal, stats);
		expect(mockRefreshSnapshot).toHaveBeenCalledWith(
			42,
			7,
			expect.objectContaining({
				v: 1,
				goal: expect.objectContaining({ name: 'Berlin Marathon' }),
				best_times: { time_for_goal: '3:35:00', pace_for_goal: '5:06 min/km' }
			})
		);
	});

	// The DAO itself is what enforces this (`revoked_at IS NULL` in the
	// update) — this just confirms a link the DAO reports as not live does
	// not make this function fail the caller's page.
	it('does not throw when the DAO reports nothing was written (a revoked or missing link)', async () => {
		mockRefreshSnapshot.mockResolvedValue({ written: false });
		await expect(refreshShareSnapshot(42, goal, stats)).resolves.toBeUndefined();
	});

	it('resolves rather than rejects when the write fails', async () => {
		mockRefreshSnapshot.mockRejectedValue(new Error('down'));
		await expect(refreshShareSnapshot(42, goal, stats)).resolves.toBeUndefined();
	});
});
