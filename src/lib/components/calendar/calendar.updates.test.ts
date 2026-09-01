import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import Calendar from './calendar.svelte';
import type { Schedule, ScheduledTraining } from '$lib/server/trenara/types';

// Wednesday 2026-08-26, so the month on screen still has open weeks and a
// refresh has something to ask about.
const TODAY = new Date(2026, 7, 26, 8, 0);

function training(day: string) {
	return {
		id: 900001,
		day_long: day,
		title: 'Session',
		blocks: []
	} as unknown as ScheduledTraining;
}

function schedule(day: string): Schedule {
	return {
		id: 1,
		start_day: 0,
		start_day_long: '2026-08-24',
		training_week: 10,
		type: 'ultimate',
		trainings: [training(day)],
		strength_trainings: [],
		entries: []
	} as unknown as Schedule;
}

/** Whether the grid is drawing a scheduled-session dot on a given day. */
function hasDot(day: number): boolean {
	return (
		screen.getByRole('button', { name: `Select day ${day}` }).querySelector('.bg-dot-scheduled') !==
		null
	);
}

/**
 * The calendar answering for itself, rather than the store answering for it.
 *
 * The store's own tests seat a refreshed month correctly and always did. What
 * they cannot see is the page handing its schedule down from an effect, which
 * is where a refreshed month was being thrown away again — so these drive the
 * whole component.
 */
describe('a plan that changed on the server', () => {
	let served: Schedule;

	beforeEach(() => {
		served = schedule('2026-08-26');
		vi.stubGlobal('matchMedia', () => ({
			media: '',
			matches: false,
			addEventListener: () => {},
			removeEventListener: () => {}
		}));
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url: string) =>
				String(url).includes('/api/v1/schedule')
					? new Response(JSON.stringify(served), {
							status: 200,
							headers: { 'content-type': 'application/json' }
						})
					: new Response('{}', { status: 200 })
			)
		);
	});
	afterEach(() => vi.unstubAllGlobals());

	it('draws the session on its new day after the refresh button', async () => {
		render(Calendar, { props: { today: TODAY, schedule: served } });

		await waitFor(() => expect(hasDot(26)).toBe(true));
		expect(hasDot(28)).toBe(false);

		// The session was moved; the server now says the 28th.
		served = schedule('2026-08-28');

		await fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

		await waitFor(() => expect(hasDot(28)).toBe(true));
		expect(hasDot(26)).toBe(false);
	});

	it('does not let the page seed put the old plan back a moment later', async () => {
		render(Calendar, { props: { today: TODAY, schedule: served } });
		await waitFor(() => expect(hasDot(26)).toBe(true));

		served = schedule('2026-08-28');
		await fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
		await waitFor(() => expect(hasDot(28)).toBe(true));

		// Seating the new month writes state the seeding effect used to read, so
		// the effect re-ran and handed the page's original schedule back down.
		// Nothing may undo the refresh after the fact.
		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(hasDot(28)).toBe(true);
		expect(hasDot(26)).toBe(false);
	});
});
