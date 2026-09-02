import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { render, cleanup, screen, waitFor } from '@testing-library/svelte';
import GoalCard from './goal-card.svelte';
import type { Goal, UserStats } from '$lib/server/trenara/types';
import type { ChartDataPoint } from '$lib/components/charts/prediction-chart.svelte';
import { secondsToTimeString, secondsToPaceString } from '$lib/utils/format';

// Same stub as the fold's tests: the card mounts a chart, and jsdom lays
// nothing out. The badge is read from the heading, not from the chart.
beforeAll(() => {
	globalThis.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;
});

afterEach(() => {
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
	}
} as unknown as UserStats;

/**
 * A stored prediction, `daysAgo` back, at `pace` seconds per kilometre.
 *
 * The time is the pace over the goal's distance rather than a constant, which
 * is what a real row holds: the pair is what says which distance a reading was
 * about, and the card reads it — a fixed time under a moving pace would be a
 * series that changes distance every day.
 */
function record(
	daysAgo: number,
	paceSeconds: number,
	distanceKm = goal.distance_value
): ChartDataPoint {
	const recorded = new Date(Date.now() - daysAgo * 86_400_000);
	const time = Math.round(paceSeconds * distanceKm);
	const pace = Math.round(paceSeconds);
	return {
		date: recorded.toISOString(),
		predictedTime: time,
		predictedPace: pace,
		formattedTime: secondsToTimeString(time),
		formattedPace: secondsToPaceString(pace)
	};
}

/** Mount with a prediction history to read a trend from. */
function mount(history: ChartDataPoint[]) {
	render(GoalCard, { props: { goal, userStats, history } });
}

/** The heading the badge sits in — not the table rows further down. */
function heading() {
	return screen.getByRole('heading', { name: /autumn marathon/i }).parentElement!;
}

describe('goal card pace trend', () => {
	it('says improving when the recorded pace has been falling', async () => {
		mount([record(13, 300), record(9, 298), record(4, 296), record(0, 294)]);
		await waitFor(() => expect(heading().textContent).toMatch(/improving/i));
		expect(heading().textContent).not.toMatch(/detraining/i);
	});

	it('says detraining when it has been rising', async () => {
		mount([record(13, 294), record(9, 296), record(4, 298), record(0, 300)]);
		await waitFor(() => expect(heading().textContent).toMatch(/detraining/i));
	});

	it('says maintaining when it has hardly moved', async () => {
		mount([record(13, 300), record(6, 300), record(0, 300)]);
		await waitFor(() => expect(heading().textContent).toMatch(/maintaining/i));
	});

	it('carries the rate behind the word, for a hover and a screen reader', async () => {
		mount([record(13, 300), record(9, 298), record(4, 296), record(0, 294)]);
		const badge = await screen.findByTitle(/predicted pace is .* per week/i);
		expect(badge.textContent).toMatch(/improving/i);
		expect(badge.textContent).toMatch(/s\/km faster per week over the last \d+ days/i);
	});

	it('answers two weeks into a block, without a block of history behind it', async () => {
		mount([record(12, 300), record(6, 296), record(0, 292)]);
		await waitFor(() => expect(heading().textContent).toMatch(/improving/i));
	});

	it('reports the fortnight rather than the block behind it', async () => {
		// Gains early on, sliding for the last two weeks. The heading is a claim
		// about now, so it says detraining.
		mount([
			record(70, 330),
			record(50, 315),
			record(30, 300),
			record(12, 292),
			record(6, 296),
			record(0, 300)
		]);
		await waitFor(() => expect(heading().textContent).toMatch(/detraining/i));
	});

	it('carries no trend badge on the very first paint', () => {
		// `history` arrives resolved as a prop now — there is no fetch and so no
		// gap between an empty first paint and the trend appearing. The badge
		// (or its absence) is correct immediately.
		mount([record(13, 300), record(9, 298), record(4, 296), record(0, 294)]);
		expect(heading().textContent).toMatch(/improving/i);
		expect(screen.queryByTestId('trend-loading')).toBeNull();
	});

	it('shows no trend badge when the history could not be read', () => {
		render(GoalCard, {
			props: { goal, userStats, history: [], historyError: 'Could not load your history.' }
		});
		expect(heading().textContent).not.toMatch(/improving|maintaining|detraining/i);
	});

	it('says nothing when there is not enough history to call a direction', async () => {
		mount([record(3, 300), record(1, 290)]);
		await waitFor(() => expect(screen.getByText(/current prediction/i)).toBeTruthy());
		expect(heading().textContent).not.toMatch(/improving|maintaining|detraining/i);
	});
});
