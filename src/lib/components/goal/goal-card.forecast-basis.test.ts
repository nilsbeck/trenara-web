import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { render, cleanup, screen, waitFor } from '@testing-library/svelte';
import GoalCard from './goal-card.svelte';
import type { Goal, UserStats } from '$lib/server/trenara/types';
import type { ChartDataPoint } from '$lib/components/charts/prediction-chart.svelte';
import { secondsToTimeString, secondsToPaceString } from '$lib/utils/format';
import { isoWeekStart } from '$lib/utils/plan-weeks';
import { mondayOf, toLocalDateString } from '$lib/utils/date';

// jsdom lays nothing out; see goal-card.load-bars.test.ts.
beforeAll(() => {
	globalThis.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;

	Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
		configurable: true,
		get: () => 500
	});
});

afterEach(() => {
	cleanup();
});

const DAY_MS = 86_400_000;
const now = new Date();
const goalStart = new Date(mondayOf(now).getTime() - 5 * 7 * DAY_MS);

function isoWeekOf(monday: Date): { year: number; week: number } {
	const target = monday.getTime();
	for (const year of [monday.getFullYear() - 1, monday.getFullYear(), monday.getFullYear() + 1]) {
		for (let week = 1; week <= 53; week++) {
			if (isoWeekStart(year, week).getTime() === target) return { year, week };
		}
	}
	throw new Error('no ISO week maps to this Monday');
}

/** Thirteen 40 km weeks from the goal's start: five run in full, this one half run. */
function planWeeks(): UserStats['graph_stats']['goal'] {
	const data = Array.from({ length: 13 }, (_, i) => {
		const { year, week } = isoWeekOf(new Date(goalStart.getTime() + i * 7 * DAY_MS));
		const done = i < 5 ? 40 : i === 5 ? 20 : null;
		return {
			week,
			order: week,
			month: 'Month',
			year,
			is_current_week: i === 5,
			done: done === null ? null : `${done}km`,
			done_value: done,
			done_unit: done === null ? null : 'km',
			done_unit_text: done === null ? null : 'km',
			todo: '40km',
			todo_value: 40,
			todo_unit: 'km',
			todo_unit_text: 'km'
		};
	});
	return {
		data,
		done: '220km',
		done_value: 220,
		done_unit: 'km',
		done_unit_text: 'km',
		todo: '520km',
		todo_value: 520,
		todo_unit: 'km',
		todo_unit_text: 'km'
	};
}

const goal = {
	id: 3,
	name: 'Autumn Marathon',
	start_date: toLocalDateString(goalStart),
	end_date: toLocalDateString(new Date(goalStart.getTime() + 13 * 7 * DAY_MS)),
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
		pace_for_goal: '5:06 min/km'
	},
	graph_stats: {
		goal: planWeeks()
	}
} as unknown as UserStats;

function reading(daysAgo: number, time: number): ChartDataPoint {
	const paceSeconds = time / 42.195;
	return {
		date: toLocalDateString(new Date(now.getTime() - daysAgo * DAY_MS)),
		predictedTime: time,
		predictedPace: paceSeconds,
		formattedTime: secondsToTimeString(time),
		formattedPace: secondsToPaceString(Math.round(paceSeconds))
	};
}

describe('goal card forecast basis', () => {
	it('says which check sent it to the plan rate, and shows the recent trend beside it', async () => {
		// Three readings: two short of a measured rate, but a fortnight of them.
		const history = [reading(34, 13200), reading(20, 13200), reading(7, 13000)];
		render(GoalCard, { props: { goal, userStats, history } });

		await waitFor(() =>
			expect(
				screen.getByText(/the plan's [\d.]+s\/km \(3 of the 5 readings yours needs\)/)
			).toBeTruthy()
		);
		expect(screen.queryByText(/not enough history for yours/)).toBeNull();

		const recent = screen.getByTestId('recent-trend');
		expect(recent.textContent).toMatch(/If the last 14 days continue/);
	});
});
