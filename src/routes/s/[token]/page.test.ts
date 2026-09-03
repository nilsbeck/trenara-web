import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { render, cleanup, screen, waitFor } from '@testing-library/svelte';
import SharePage from './+page.svelte';
import { isoWeekStart } from '$lib/utils/plan-weeks';
import { mondayOf } from '$lib/utils/date';
import { secondsToTimeString, secondsToPaceString } from '$lib/utils/format';

beforeAll(() => {
	globalThis.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;

	// The load bars measure the chart's own width to size themselves — jsdom
	// otherwise reports zero, which would flatten every bar before the test
	// below got to look for one.
	Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
		configurable: true,
		get: () => 500
	});
});

afterEach(() => cleanup());

const goal = {
	name: 'Berlin Marathon',
	start_date: '2026-01-06',
	end_date: '2099-01-01',
	distance: '42.195 km',
	distance_unit: 'km',
	distance_value: 42.195,
	time: '3:30:00',
	time_in_sec: 12600,
	pace: '5:00 min/km'
};

const userStats = {
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
};

function mount(data: Record<string, unknown>) {
	render(SharePage, { props: { data } as never });
}

describe('the shared goal page', () => {
	it('renders the goal card for a live, snapshotted link', () => {
		mount({
			title: null,
			name: 'Nils',
			snapshotAt: '2026-08-01T00:00:00Z',
			goal,
			userStats,
			history: { records: [], error: null }
		});

		expect(screen.getByRole('heading', { level: 1, name: /berlin marathon/i })).toBeTruthy();
		expect(screen.getByText(/updated/i)).toBeTruthy();
	});

	it('prefers the runner-given title over the goal name', () => {
		mount({
			title: 'Follow me to Berlin!',
			name: 'Nils',
			snapshotAt: '2026-08-01T00:00:00Z',
			goal,
			userStats,
			history: { records: [], error: null }
		});

		expect(screen.getByRole('heading', { level: 1, name: /follow me to berlin/i })).toBeTruthy();
	});

	it('shows the waiting state rather than a card when there is no snapshot yet', () => {
		mount({
			title: null,
			name: 'Nils',
			snapshotAt: null,
			goal: null,
			userStats: null,
			history: { records: [], error: null }
		});

		expect(screen.getByText(/not updated yet/i)).toBeTruthy();
		expect(screen.queryByRole('heading', { level: 2, name: /berlin marathon/i })).toBeNull();
	});

	it('draws the training-still-to-come bars from the snapshotted plan weeks', async () => {
		// The snapshot's `plan_weeks` is the same raw `graph_stats.goal` the
		// dashboard reads its bars from, so a visitor's link should draw them
		// too — with no forecast in reach yet, which is the case this guards:
		// the bars are not something the forecast hands down to this page, they
		// come from the plan on their own.
		const DAY_MS = 86_400_000;
		const now = new Date();

		function isoWeekOf(monday: Date): { year: number; week: number } {
			const target = monday.getTime();
			for (const year of [
				monday.getFullYear() - 1,
				monday.getFullYear(),
				monday.getFullYear() + 1
			]) {
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

		const start = mondayOf(now);
		const planData = Array.from({ length: 4 }, (_, i) =>
			row(new Date(start.getTime() + i * 7 * DAY_MS), 40)
		);

		const paceSeconds = 302;
		const time = Math.round(paceSeconds * 42.195);
		const reading = {
			date: now.toISOString(),
			predictedTime: time,
			predictedPace: paceSeconds,
			formattedTime: secondsToTimeString(time),
			formattedPace: secondsToPaceString(paceSeconds)
		};

		mount({
			title: null,
			name: 'Nils',
			snapshotAt: '2026-08-01T00:00:00Z',
			// A race day close enough that a week of the plan is still a visible
			// slice of the chart's width — `goal`'s own 2099 end date is so far
			// out that every week thins to a sub-pixel sliver and none of them
			// clear the "hairline of daylight between weeks" gap, which is a
			// property of that fixture's date, not of whether the bars are drawn.
			goal: { ...goal, end_date: new Date(now.getTime() + 56 * DAY_MS).toISOString().slice(0, 10) },
			userStats: {
				...userStats,
				graph_stats: {
					goal: {
						...userStats.graph_stats.goal,
						data: planData,
						todo_value: planData.reduce((sum, r) => sum + r.todo_value, 0)
					}
				}
			},
			history: { records: [reading], error: null }
		});

		await waitFor(() => expect(screen.getByText(/bars: km to come/i)).toBeTruthy());
	});

	it('carries the unofficial-client disclaimer', () => {
		mount({
			title: null,
			name: null,
			snapshotAt: null,
			goal: null,
			userStats: null,
			history: { records: [], error: null }
		});

		expect(screen.getByText(/unofficial, unaffiliated third-party client/i)).toBeTruthy();
	});
});
