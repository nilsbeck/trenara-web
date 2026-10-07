import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
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

// Pinned to a Monday. The fixture builds its plan around today, and the
// current week's 20km is "half run" only early in the week: from Wednesday
// on, the same figure reads as a slower week, the forecast shifts, and the
// "short of goal pace" line this test asserts no longer appears. Read off the
// real clock, the test passed on Mondays and Tuesdays and failed otherwise.
// Only `Date` is faked, so `waitFor`'s timers still run.
vi.hoisted(() => {
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(new Date(2026, 9, 5, 12));
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
	// Far enough off that neither projection is stopped at the goal.
	pace: '4:44 min/km',
	time: '03:20:00',
	time_in_sec: 12000
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
	it('says which check sent it to the plan rate, and draws the recent trend as the line', async () => {
		// Three readings: two short of a measured rate, but a fortnight of them.
		const history = [reading(34, 13200), reading(20, 13200), reading(7, 13000)];
		const { container } = render(GoalCard, { props: { goal, userStats, history } });

		// The basis names the fortnight's rate, and the plan's figure beside it.
		await waitFor(() =>
			expect(
				screen.getByText(/at your last 14 days' [\d.]+s\/km.*At the plan's [\d.]+s\/km instead/)
			).toBeTruthy()
		);
		expect(screen.getByText(/short of goal pace/)).toBeTruthy();

		// "Projected on race day" is the trend's end, not the plan's: the plan's
		// figure is the one quoted in the basis, and the trend here is faster.
		const toSeconds = (t: string) => t.split(':').reduce((sum, part) => sum * 60 + Number(part), 0);
		const basis = screen.getByText(/At the plan's/).textContent!;
		const planEnd = toSeconds(basis.match(/instead: (\d+:\d{2}:\d{2})/)![1]);
		const row = screen.getByText('Projected on race day').closest('tr')!;
		const projected = toSeconds(row.textContent!.match(/\d+:\d{2}:\d{2}/)![0]);
		expect(projected).toBeLessThan(planEnd);

		// The trend is the graph's one projection, named in its caption; the
		// table row it used to be is gone.
		expect(container.textContent).toContain('Forecast');
		expect(container.querySelectorAll('path[stroke-dasharray="5,4"]').length).toBe(1);
		expect(screen.queryByText(/If the last 14 days continue/)).toBeNull();
		expect(screen.queryByTestId('no-recent-line')).toBeNull();
	});

	it('says why there is no trend line when it cannot draw one', async () => {
		// Readings that span three weeks, but nothing logged as run: the plan
		// rate still draws a forecast, and the trend has nothing to divide by.
		const idle = {
			...userStats,
			graph_stats: {
				goal: {
					...planWeeks(),
					data: planWeeks().data.map((row) => ({ ...row, done: null, done_value: null }))
				}
			}
		} as unknown as UserStats;
		const history = [reading(34, 13200), reading(20, 13200), reading(7, 13000)];
		const { container } = render(GoalCard, { props: { goal, userStats: idle, history } });

		const note = await screen.findByTestId('no-recent-line');
		expect(note.textContent).toMatch(/No trend line: no km logged as run in the last 14 days/);
		// With no trend the plan's forecast stands in, and says why it is the plan's.
		expect(
			screen.getByText(/the plan's [\d.]+s\/km \(3 of the 5 readings yours needs\)/)
		).toBeTruthy();
		expect(screen.getByText(/if you follow the rest of the plan|short of goal pace/)).toBeTruthy();
		expect(container.querySelectorAll('path[stroke-dasharray="5,4"]').length).toBe(0);
	});
});
