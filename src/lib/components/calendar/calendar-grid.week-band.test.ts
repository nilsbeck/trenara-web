import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import CalendarGrid from './calendar-grid.svelte';
import { createCalendarStore } from '$lib/stores/calendar.svelte';
import { readPlanWeeks } from '$lib/utils/plan-weeks';
import type { Schedule, UserStats } from '$lib/server/trenara/types';

type GoalSeries = UserStats['graph_stats']['goal'];

function row(week: number, todo: number, done: number | null) {
	return {
		week,
		order: week - 28,
		month: 'August',
		year: 2026,
		is_current_week: week === 35,
		done: done === null ? null : `${done}km`,
		done_value: done,
		done_unit: done === null ? null : 'km',
		done_unit_text: done === null ? null : 'km',
		todo: `${todo}km`,
		todo_value: todo,
		todo_unit: 'km',
		todo_unit_text: 'km'
	};
}

/** Weeks 31–36 of the reference plan; 32 peaks, 33 and 35 step down. */
function series(): GoalSeries {
	return {
		data: [
			row(31, 43.8, 23.09),
			row(32, 64.1, null),
			row(33, 51.52, null),
			row(34, 59.68, 53.8),
			row(35, 36.94, 8),
			row(36, 55.57, null)
		],
		done: '159.69km',
		done_value: 159.69,
		done_unit: 'km',
		done_unit_text: 'km',
		todo: '595.36km',
		todo_value: 595.36,
		todo_unit: 'km',
		todo_unit_text: 'km'
	};
}

function emptySchedule(): Schedule {
	return {
		id: 1,
		start_day: 0,
		start_day_long: '2026-08-01',
		training_week: 1,
		type: 'ultimate',
		trainings: [],
		strength_trainings: [],
		entries: []
	};
}

function renderAugust2026(planWeeks: ReturnType<typeof readPlanWeeks> | null) {
	const store = createCalendarStore(new Date(2026, 7, 24));
	store.setSchedule(emptySchedule(), new Date(2026, 7, 24));
	render(CalendarGrid, {
		props: { planWeeks },
		context: new Map([['calendar', store]])
	});
}

describe('week bands in the month grid', () => {
	it('labels the weeks of the plan that are worth noticing', () => {
		renderAugust2026(readPlanWeeks(series()));

		// August 2026 starts on a Saturday, so its rows begin on 27 July and run
		// weekly: the peak (w32, 3 Aug), two step-downs (w33 and w35) and two
		// build weeks (w34, w36).
		expect(screen.getAllByText('Peak week')).toHaveLength(1);
		expect(screen.getAllByText('Recovery week')).toHaveLength(2);
		expect(screen.getAllByText('Build week')).toHaveLength(2);
	});

	it('says which way each one can go wrong', () => {
		renderAugust2026(readPlanWeeks(series()));

		expect(screen.getAllByText('· complete it').length).toBeGreaterThan(0);
		expect(screen.getAllByText('· keep it easy').length).toBeGreaterThan(0);
		expect(screen.getByText('64 km — the biggest week of the plan')).toBeTruthy();
	});

	it('renders the plain grid when there is no plan to read', () => {
		renderAugust2026(null);

		expect(screen.queryByText('Peak week')).toBeNull();
		expect(screen.queryByText('Recovery week')).toBeNull();
	});
});
