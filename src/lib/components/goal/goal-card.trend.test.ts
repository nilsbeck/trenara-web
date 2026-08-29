import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { render, cleanup, screen, waitFor } from '@testing-library/svelte';
import GoalCard from './goal-card.svelte';
import type { Goal, UserStats } from '$lib/server/trenara/types';

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
	vi.unstubAllGlobals();
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

/** A stored prediction, `daysAgo` back, at `pace` seconds per kilometre. */
function record(daysAgo: number, paceSeconds: number) {
	const recorded = new Date(Date.now() - daysAgo * 86_400_000);
	const mm = Math.floor(paceSeconds / 60);
	const ss = String(Math.round(paceSeconds % 60)).padStart(2, '0');
	return {
		id: daysAgo,
		user_id: 1,
		predicted_time: '03:35:00',
		predicted_pace: `${mm}:${ss}`,
		predicted_time_10k: null,
		predicted_pace_10k: null,
		recorded_at: recorded.toISOString(),
		created_at: recorded.toISOString()
	};
}

/**
 * Mount with a prediction history to read a trend from.
 *
 * Only the history GET matters; the other two calls the card makes on mount
 * (track the current prediction, archive the goal) are answered with nothing.
 */
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

	it('says nothing when there is not enough history to call a direction', async () => {
		mount([record(3, 300), record(1, 290)]);
		// The chart's own empty state would settle later than the badge would
		// appear, so wait for the card to have finished loading either way.
		await waitFor(() => expect(screen.getByText(/current prediction/i)).toBeTruthy());
		expect(heading().textContent).not.toMatch(/improving|maintaining|detraining/i);
	});
});
