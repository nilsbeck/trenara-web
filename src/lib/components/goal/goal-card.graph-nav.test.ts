import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { render, cleanup, screen, fireEvent } from '@testing-library/svelte';
import GoalCard from './goal-card.svelte';
import type { Goal, UserStats } from '$lib/server/trenara/types';

// The card mounts a chart, and jsdom lays nothing out: it has no ResizeObserver
// and every element measures zero. Only the picker is under test here.
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

/** A goal still running, so the card renders its graph rather than the completed state. */
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

function picker(): HTMLSelectElement {
	return screen.getByLabelText('Which graph to show') as HTMLSelectElement;
}

/** Click the arrow that goes to a named graph; each arrow is labelled by its destination. */
function step(label: string) {
	return fireEvent.click(screen.getByLabelText(`Show ${label}`));
}

describe('goal card graph navigation', () => {
	it('opens on the prediction graph', () => {
		render(GoalCard, { goal, userStats, history: [] });
		expect(picker().value).toBe('prediction');
	});

	it('steps forward through the graphs and wraps round to the first', async () => {
		render(GoalCard, { goal, userStats, history: [] });

		await step('Distance This Week');
		expect(picker().value).toBe('week');

		await step('Distance By Week');
		expect(picker().value).toBe('goal');

		await step('Prediction Progress');
		expect(picker().value).toBe('prediction');
	});

	it('steps back from the opening view by wrapping to the last graph', async () => {
		render(GoalCard, { goal, userStats, history: [] });

		// Two arrows point away from 'prediction': back to 'goal', forward to
		// 'week'. Neither dead-ends, which is what the wrap is for.
		await step('Distance By Week');
		expect(picker().value).toBe('goal');
	});

	it('keeps the dropdown working as the other way to switch', async () => {
		render(GoalCard, { goal, userStats, history: [] });

		await fireEvent.change(picker(), { target: { value: 'week' } });
		expect(picker().value).toBe('week');

		// And the arrows carry on from wherever the dropdown left off.
		await step('Distance By Week');
		expect(picker().value).toBe('goal');
	});
});
