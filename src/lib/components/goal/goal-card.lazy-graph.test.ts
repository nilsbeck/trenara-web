import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { render, cleanup, screen, waitFor, fireEvent } from '@testing-library/svelte';
import GoalCard from './goal-card.svelte';
import type { Goal, UserStats } from '#lib/server/trenara/types.js';

/**
 * The goal card's graph as a lazy chunk: what the card draws while the charts
 * are on their way, once they have arrived, and when they cannot be had.
 *
 * The load is controlled through `loadOnce`, which the card's module script
 * wraps each chart's import in: a call here waits on that chart's gate and
 * then either fails or performs the real import. Which chart a loader is for
 * is read from the import it wraps.
 */

type Which = 'prediction' | 'distance';

const charts = vi.hoisted(() => {
	const open = () => Promise.resolve();
	const gates: Record<'prediction' | 'distance', Promise<void>> = {
		prediction: open(),
		distance: open()
	};
	const releases: Record<'prediction' | 'distance', () => void> = {
		prediction: () => {},
		distance: () => {}
	};
	return {
		gates,
		fail: false,
		hold(...which: ('prediction' | 'distance')[]) {
			for (const w of which.length ? which : (['prediction', 'distance'] as const)) {
				gates[w] = new Promise<void>((resolve) => (releases[w] = resolve));
			}
		},
		release(...which: ('prediction' | 'distance')[]) {
			for (const w of which.length ? which : (['prediction', 'distance'] as const)) {
				releases[w]();
			}
		},
		reset() {
			this.release();
			gates.prediction = open();
			gates.distance = open();
			this.fail = false;
		}
	};
});

const reload = vi.hoisted(() => vi.fn());

vi.mock('#lib/utils/load-once.js', async (importOriginal) => ({
	...(await importOriginal<typeof import('#lib/utils/load-once.js')>()),
	loadOnce:
		<T>(load: () => Promise<T>) =>
		async () => {
			const which: Which = String(load).includes('distance-chart') ? 'distance' : 'prediction';
			await charts.gates[which];
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
	charts.reset();
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

	/**
	 * The two charts used to be loaded as a pair, so the prediction graph —
	 * the one the card opens on — waited for the distance chart it was not
	 * showing. Each is its own chunk and arrives on its own now.
	 */
	it('shows the graph in view without waiting for the other one', async () => {
		charts.hold('distance');
		render(GoalCard, { goal, userStats, history: [] });

		await waitFor(() => expect(screen.getByText(/no prediction data yet/i)).toBeTruthy());

		// The distance chart is still on its way, and only its graph waits for it.
		const picker = screen.getByLabelText('Which graph to show') as HTMLSelectElement;
		await fireEvent.change(picker, { target: { value: 'week' } });
		expect(screen.getByTestId('goal-chart-loading')).toBeTruthy();

		charts.release('distance');
		await waitFor(() => expect(screen.queryByTestId('goal-chart-loading')).toBeNull());
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
