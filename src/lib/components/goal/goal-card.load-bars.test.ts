import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { render, cleanup, screen, waitFor } from '@testing-library/svelte';
import GoalCard from './goal-card.svelte';
import type { Goal, UserStats } from '$lib/server/trenara/types';
import type { ChartDataPoint } from '$lib/components/charts/prediction-chart.svelte';
import { secondsToTimeString, secondsToPaceString } from '$lib/utils/format';
import { isoWeekStart } from '$lib/utils/plan-weeks';
import { mondayOf, toLocalDateString } from '$lib/utils/date';

// jsdom lays nothing out: it has no ResizeObserver, and every element measures
// zero width, which would flatten every bar to nothing before the assertion
// below ever got to check them.
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

/** The `{ year, week }` that `isoWeekStart` maps back onto this Monday. */
function isoWeekOf(monday: Date): { year: number; week: number } {
	const target = monday.getTime();
	for (const year of [monday.getFullYear() - 1, monday.getFullYear(), monday.getFullYear() + 1]) {
		for (let week = 1; week <= 53; week++) {
			if (isoWeekStart(year, week).getTime() === target) return { year, week };
		}
	}
	throw new Error('no ISO week maps to this Monday');
}

function row(startsOn: Date, todo: number) {
	const { year, week } = isoWeekOf(startsOn);
	return {
		week,
		order: week,
		month: 'Month',
		year,
		is_current_week: false,
		done: null,
		done_value: null,
		done_unit: null,
		done_unit_text: null,
		todo: `${todo}km`,
		todo_value: todo,
		todo_unit: 'km',
		todo_unit_text: 'km'
	};
}

/** Eight weeks of planned training, starting this week. */
function planWeeks(): UserStats['graph_stats']['goal'] {
	const start = mondayOf(now);
	const data = Array.from({ length: 8 }, (_, i) =>
		row(new Date(start.getTime() + i * 7 * DAY_MS), 40)
	);
	const total = data.reduce((sum, r) => sum + r.todo_value, 0);
	return {
		data,
		done: '0km',
		done_value: 0,
		done_unit: 'km',
		done_unit_text: 'km',
		todo: `${total}km`,
		todo_value: total,
		todo_unit: 'km',
		todo_unit_text: 'km'
	};
}

/** A goal 8 weeks out, with a plan but too little history to forecast from. */
const goal = {
	id: 3,
	name: 'Autumn Marathon',
	start_date: toLocalDateString(now),
	end_date: toLocalDateString(new Date(now.getTime() + 56 * DAY_MS)),
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

/** A single reading recorded today — one point, not enough for a forecast. */
function todaysReading(): ChartDataPoint {
	const paceSeconds = 302;
	const time = Math.round(paceSeconds * 42.195);
	return {
		date: now.toISOString(),
		predictedTime: time,
		predictedPace: paceSeconds,
		formattedTime: secondsToTimeString(time),
		formattedPace: secondsToPaceString(paceSeconds)
	};
}

describe('goal card training-km bars', () => {
	it('draws the plan-ahead bars even when there is not enough history to forecast', async () => {
		const { container } = render(GoalCard, {
			props: { goal, userStats, history: [todaysReading()] }
		});

		// No forecast yet — confirms the scenario is the one this test is for.
		await waitFor(() =>
			expect(screen.getByText(/not enough of this block on record yet to forecast/i)).toBeTruthy()
		);

		expect(container.textContent).toContain('bars: km to come');
		expect(container.querySelectorAll('rect.fill-muted-foreground').length).toBeGreaterThan(0);
	});
});
