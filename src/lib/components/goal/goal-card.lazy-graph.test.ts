import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { render, cleanup, screen, waitFor, fireEvent } from '@testing-library/svelte';
import GoalCard from './goal-card.svelte';
import type { Goal, UserStats } from '#lib/server/trenara/types.js';

/**
 * The goal card's graph as a lazy chunk: what the card draws while the charts
 * are on their way, once they have arrived, and when they cannot be had.
 *
 * The load is controlled through `loadOnce`, which the card's module script
 * wraps its imports in: each call here waits on `charts.gate` and then either
 * fails or performs the real imports.
 */

const charts = vi.hoisted(() => {
	let release: () => void = () => {};
	return {
		gate: Promise.resolve(),
		fail: false,
		hold() {
			this.gate = new Promise<void>((resolve) => (release = resolve));
		},
		release: () => release()
	};
});

const reload = vi.hoisted(() => vi.fn());

vi.mock('#lib/utils/load-once.js', async (importOriginal) => ({
	...(await importOriginal<typeof import('#lib/utils/load-once.js')>()),
	loadOnce:
		<T>(load: () => Promise<T>) =>
		async () => {
			await charts.gate;
			if (charts.fail) throw new TypeError('Failed to fetch dynamically imported module');
			return load();
		},
	reloadOnStaleChunk: reload
}));

// jsdom lays nothing out; the charts measure a ResizeObserver-less zero.
beforeAll(() => {
	globalThis.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;
});

afterEach(() => {
	charts.release();
	charts.gate = Promise.resolve();
	charts.fail = false;
	reload.mockReset();
	cleanup();
});

const goal = {
	id: 1,
	name: 'Autumn Marathon',
	start_date: '2026-01-01',
	end_date: '2099-01-01',
	distance: '42.2 km',
	distance_value: 42.2,
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
	},
	graph_stats: { weeks: null, goal: null }
} as unknown as UserStats;

describe('the goal card graph, loaded after the page', () => {
	it('holds the graph’s place and says what is waiting', () => {
		charts.hold();
		render(GoalCard, { goal, userStats, history: [] });

		const pending = screen.getByTestId('goal-chart-loading');
		expect(pending.getAttribute('role')).toBe('status');
		expect(pending.textContent).toContain('Loading the graph');
		// The chart's own footprint: legend, plot and read-out.
		expect(pending.className).toContain('h-[19.75rem]');
		// The head, with the prediction itself, does not wait for the graph.
		expect(screen.getAllByText('03:35:00').length).toBeGreaterThan(0);
	});

	it('swaps the placeholder for the chart once it has arrived', async () => {
		charts.hold();
		render(GoalCard, { goal, userStats, history: [] });

		charts.release();

		await waitFor(() => expect(screen.getByText(/no prediction data yet/i)).toBeTruthy());
		expect(screen.queryByTestId('goal-chart-loading')).toBeNull();
	});

	it('says the graph could not be loaded, rather than spinning forever, and offers a reload', async () => {
		charts.fail = true;
		render(GoalCard, { goal, userStats, history: [] });

		const failed = await screen.findByTestId('goal-chart-failed');
		expect(failed.textContent).toContain('could not be loaded');
		expect(screen.queryByTestId('goal-chart-loading')).toBeNull();

		await fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
		expect(reload).toHaveBeenCalled();
	});
});
