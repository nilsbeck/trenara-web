import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import CalendarPage from '../../../test-utils/calendar-page.svelte';
import { resetRatedLocally } from '$lib/utils/rated-locally';
import type { Entry, Schedule, ScheduledTraining } from '$lib/server/trenara/types';

// Wednesday 2026-08-26, evening: the morning's run is done and unrated.
const TODAY = new Date(2026, 7, 26, 18, 0);

const PROMPT = 'How did this training feel?';

function run(rpe: number | null): Entry {
	return {
		id: 555,
		type: 'run',
		start_time: '2026-08-26T07:00:00+02:00',
		rpe,
		ask_feedback: rpe === null
	} as unknown as Entry;
}

function schedule(entry: Entry): Schedule {
	return {
		id: 1,
		start_day: 0,
		start_day_long: '2026-08-24',
		training_week: 10,
		type: 'ultimate',
		trainings: [
			{
				id: 900001,
				day_long: '2026-08-26',
				title: 'Session',
				blocks: []
			} as unknown as ScheduledTraining
		],
		strength_trainings: [],
		entries: [entry]
	} as unknown as Schedule;
}

/**
 * The rating flow against the page around the calendar, not the store alone.
 *
 * The store kept a rating correctly and always did. What put the prompt back
 * was the calendar re-seating the page's own `data.schedule` — the copy from
 * before the rating — every time a layout load re-ran and SvelteKit handed the
 * page a new `data` object around the same schedule. Resuming the PWA the next
 * day does exactly that: the new-day revalidation calls `refreshPageData`,
 * which invalidates `app:news`. The five-minute local memory in
 * `rated-locally.ts` hid it from any check made soon after rating.
 */
describe('a rating on the calendar', () => {
	beforeEach(() => {
		resetRatedLocally();
		vi.stubGlobal('matchMedia', () => ({
			media: '',
			matches: false,
			addEventListener: () => {},
			removeEventListener: () => {}
		}));
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url: string) =>
				String(url).includes('/api/v1/feedback')
					? new Response(JSON.stringify(run(6)), {
							status: 200,
							headers: { 'content-type': 'application/json' }
						})
					: new Response('{}', { status: 200 })
			)
		);
	});
	afterEach(() => {
		resetRatedLocally();
		vi.unstubAllGlobals();
	});

	async function rate() {
		await waitFor(() => expect(screen.queryByText(PROMPT)).not.toBeNull());
		await fireEvent.click(screen.getByRole('button', { name: /rate training/i }));
		await waitFor(() => expect(screen.queryByText(PROMPT)).toBeNull());
	}

	it('is not taken back when a layout load re-runs around the same page data', async () => {
		const data = { schedule: schedule(run(null)), badge: 0 };
		const { rerender } = render(CalendarPage, { props: { data, today: TODAY } });
		await rate();

		// Days later: the local memory of the rating has long lapsed, and the
		// resumed PWA's revalidation re-runs the layout load. The page's own load
		// did not run, so `data.schedule` is still the copy from before the rating.
		resetRatedLocally();
		await rerender({ data: { ...data, badge: 1 }, today: TODAY });

		// Given the chance to come back, it must not.
		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(screen.queryByText(PROMPT)).toBeNull();
	});

	it('still takes a schedule from a page load that actually ran again', async () => {
		const { rerender } = render(CalendarPage, {
			props: { data: { schedule: schedule(run(null)) }, today: TODAY }
		});
		await rate();

		// A real navigation brings a new schedule object, and that one speaks for
		// the server — here, saying the session is unrated after all.
		resetRatedLocally();
		await rerender({ data: { schedule: schedule(run(null)) }, today: TODAY });

		await waitFor(() => expect(screen.queryByText(PROMPT)).not.toBeNull());
	});
});
