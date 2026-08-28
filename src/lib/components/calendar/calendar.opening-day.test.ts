import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import Calendar from './calendar.svelte';
import type { Entry, Schedule, ScheduledTraining } from '$lib/server/trenara/types';

// Wednesday 2026-08-26.
const TODAY = new Date(2026, 7, 26, 8, 0);

function training(day: string) {
	return {
		id: Number(day.replaceAll('-', '')),
		day_long: day,
		title: 'Session',
		blocks: []
	} as unknown as ScheduledTraining;
}

function run(day: string, rpe: number | null) {
	return {
		id: 900,
		type: 'run',
		name: 'Morning run',
		start_time: `${day}T09:00:00+02:00`,
		rpe
	} as unknown as Entry;
}

function schedule(partial: Partial<Schedule>): Schedule {
	return {
		id: 1,
		start_day: 0,
		start_day_long: '2026-08-24',
		training_week: 10,
		type: 'ultimate',
		trainings: [],
		strength_trainings: [],
		entries: [],
		...partial
	} as unknown as Schedule;
}

/** The day number the grid is highlighting as selected. */
async function selectedDay(): Promise<string> {
	return await waitFor(() => {
		const cell = screen
			.getAllByRole('button')
			.find((button) => button.classList.contains('bg-calendar-selected'));
		if (!cell) throw new Error('nothing selected yet');
		return cell.textContent?.trim() ?? '';
	});
}

describe('the day the calendar opens on', () => {
	beforeEach(() => {
		vi.stubGlobal(
			'fetch',
			vi.fn(
				async () =>
					new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
			)
		);
	});
	afterEach(() => vi.unstubAllGlobals());

	it('opens on the last completed run while it still wants a rating', async () => {
		render(Calendar, {
			props: {
				today: TODAY,
				schedule: schedule({
					trainings: [training('2026-08-25'), training('2026-08-28')],
					entries: [run('2026-08-25', null)]
				})
			}
		});

		expect(await selectedDay()).toBe('25');
	});

	it('opens on today when there is a session on it', async () => {
		render(Calendar, {
			props: {
				today: TODAY,
				schedule: schedule({ trainings: [training('2026-08-26'), training('2026-08-29')] })
			}
		});

		expect(await selectedDay()).toBe('26');
	});

	it('skips an empty today for the next session ahead', async () => {
		render(Calendar, {
			props: {
				today: TODAY,
				schedule: schedule({
					trainings: [training('2026-08-24'), training('2026-08-29')],
					entries: [run('2026-08-24', 5)]
				})
			}
		});

		expect(await selectedDay()).toBe('29');
	});

	it('still opens on today when the week holds nothing at all', async () => {
		render(Calendar, { props: { today: TODAY, schedule: schedule({}) } });

		expect(await selectedDay()).toBe('26');
	});
});
