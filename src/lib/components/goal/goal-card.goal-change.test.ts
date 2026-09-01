import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { render, cleanup, screen, waitFor } from '@testing-library/svelte';
import GoalCard from './goal-card.svelte';
import type { Goal, UserStats } from '$lib/server/trenara/types';
import { secondsToTimeString, secondsToPaceString } from '$lib/utils/format';

// The card mounts a chart and jsdom lays nothing out.
beforeAll(() => {
	globalThis.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

/** The goal as it stands after the change: a marathon, started today. */
const goal = {
	id: 2,
	name: 'Spring Marathon',
	start_date: new Date().toISOString().split('T')[0],
	end_date: '2099-01-01',
	distance: '42.195 km',
	distance_value: 42.195,
	distance_unit: 'km',
	pace: '5:00 min/km',
	time: '03:30:00',
	time_in_sec: 12600
} as unknown as Goal;

const userStats = {
	best_times: {
		time_for_goal: '03:35:00',
		pace_for_goal: '5:06 min/km',
		time_for_10: '00:45:00',
		pace_for_10: '4:30 min/km'
	}
} as unknown as UserStats;

/** A stored reading over `distanceKm`, `daysAgo` back, at `pace` s/km. */
function record(daysAgo: number, paceSeconds: number, distanceKm: number) {
	const recorded = new Date(Date.now() - daysAgo * 86_400_000);
	return {
		id: daysAgo,
		user_id: 1,
		predicted_time: secondsToTimeString(Math.round(paceSeconds * distanceKm)),
		predicted_pace: secondsToPaceString(Math.round(paceSeconds)),
		predicted_time_10k: null,
		predicted_pace_10k: null,
		recorded_at: recorded.toISOString(),
		created_at: recorded.toISOString()
	};
}

function mount(records: ReturnType<typeof record>[]) {
	vi.stubGlobal(
		'fetch',
		vi.fn(async (url: string, init?: RequestInit) =>
			init?.method === 'POST'
				? new Response(JSON.stringify({ stored: false }), { status: 200 })
				: new Response(JSON.stringify({ records }), { status: 200 })
		)
	);
	render(GoalCard, { props: { goal, userStats } });
}

describe('goal card after a goal change', () => {
	it('leaves out a reading recorded for the goal that was replaced', async () => {
		// The morning's 15 km reading, still inside the new goal's window
		// because the new goal started today.
		mount([record(0, 253, 15)]);

		await waitFor(() =>
			expect(screen.getByText(/1 earlier reading for a 15 km goal/i)).toBeTruthy()
		);
		// Nothing left to plot, and the chart says so rather than drawing a
		// 1:03 finish under a 3:30 goal line.
		expect(screen.getByText(/no prediction data yet/i)).toBeTruthy();
	});

	it('says nothing when every reading is for this goal', async () => {
		mount([record(9, 306, 42.195), record(4, 304, 42.195), record(0, 302, 42.195)]);

		await waitFor(() => expect(screen.queryByText(/no prediction data yet/i)).toBeNull());
		expect(screen.queryByText(/not plotted/i)).toBeNull();
	});

	it('keeps the readings for this goal and drops only the old ones', async () => {
		mount([record(1, 253, 15), record(0, 306, 42.195)]);

		await waitFor(() => expect(screen.getByText(/not plotted/i)).toBeTruthy());
		expect(screen.queryByText(/no prediction data yet/i)).toBeNull();
	});
});
