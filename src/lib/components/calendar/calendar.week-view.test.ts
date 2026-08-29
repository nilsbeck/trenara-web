import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import Calendar from './calendar.svelte';
import type { Schedule, ScheduledTraining } from '$lib/server/trenara/types';

// Wednesday 2026-08-26. August 2026 ends on a Monday, so the week after the one
// it opens on runs into September.
const TODAY = new Date(2026, 7, 26, 8, 0);

function training(day: string) {
	return {
		id: Number(day.replaceAll('-', '')),
		day_long: day,
		title: 'Session',
		blocks: []
	} as unknown as ScheduledTraining;
}

function schedule(partial: Partial<Schedule> = {}): Schedule {
	return {
		id: 1,
		start_day: 0,
		start_day_long: '2026-08-24',
		training_week: 10,
		type: 'ultimate',
		trainings: [training('2026-08-26')],
		strength_trainings: [],
		entries: [],
		...partial
	} as unknown as Schedule;
}

/** The day numbers the grid is currently showing, in order. */
function shownDays(): string[] {
	return screen
		.getAllByRole('button', { name: /^Select day/ })
		.map((button) => button.textContent?.trim() ?? '');
}

describe('folding the month into a week', () => {
	beforeEach(() => {
		vi.stubGlobal(
			'fetch',
			vi.fn(
				async () =>
					new Response(JSON.stringify(schedule({ trainings: [] })), {
						status: 200,
						headers: { 'content-type': 'application/json' }
					})
			)
		);
	});
	afterEach(() => vi.unstubAllGlobals());

	it('shows the whole month until the arrow is used', async () => {
		render(Calendar, { props: { today: TODAY, schedule: schedule() } });

		await waitFor(() => expect(shownDays()).toHaveLength(31));
		expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('August 2026');
	});

	it('folds down to the week of the selected day, and back out again', async () => {
		render(Calendar, { props: { today: TODAY, schedule: schedule() } });

		await waitFor(() => expect(shownDays()).toHaveLength(31));

		await fireEvent.click(screen.getByRole('button', { name: 'Show only this week' }));

		await waitFor(() => expect(shownDays()).toEqual(['24', '25', '26', '27', '28', '29', '30']));
		expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('24 – 30 August 2026');

		await fireEvent.click(screen.getByRole('button', { name: 'Show the whole month' }));

		await waitFor(() => expect(shownDays()).toHaveLength(31));
		expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('August 2026');
	});

	it('steps a week at a time while folded, into the next month', async () => {
		render(Calendar, { props: { today: TODAY, schedule: schedule() } });

		await waitFor(() => expect(shownDays()).toHaveLength(31));
		await fireEvent.click(screen.getByRole('button', { name: 'Show only this week' }));
		await waitFor(() => expect(shownDays()).toHaveLength(7));

		await fireEvent.click(screen.getByRole('button', { name: 'Next week' }));

		await waitFor(() => expect(shownDays()).toEqual(['31', '1', '2', '3', '4', '5', '6']));
		expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('31 Aug – 6 Sep 2026');
	});
});
