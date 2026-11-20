import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import Calendar from './calendar.svelte';
import type { Schedule, ScheduledTraining } from '#lib/server/trenara/types.js';

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

/**
 * A viewport of a given width, as far as `matchMedia` is concerned.
 *
 * jsdom answers every media query with `false`, which reads as a desktop —
 * fine for the tests that want one, no use at all for the tests that want a
 * phone. This evaluates the one form of query the calendar asks.
 */
function stubViewport(width: number) {
	const listeners = new Set<() => void>();
	let current = width;

	const matches = () => current <= 767;

	vi.stubGlobal('matchMedia', (query: string) => ({
		media: query,
		get matches() {
			return matches();
		},
		addEventListener: (_: string, listener: () => void) => listeners.add(listener),
		removeEventListener: (_: string, listener: () => void) => listeners.delete(listener)
	}));

	/** Resize, and tell whoever is listening. */
	return (next: number) => {
		current = next;
		for (const listener of listeners) listener();
	};
}

/** The heading, which is itself the control that folds and unfolds the grid. */
function foldToggle(): HTMLElement {
	return within(screen.getByRole('heading', { level: 2 })).getByRole('button');
}

/** What the heading reads, without the chevron's whitespace. */
function headingText(): string {
	return screen.getByRole('heading', { level: 2 }).textContent?.trim() ?? '';
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
		expect(headingText()).toBe('August 2026');
	});

	it('folds from a press on the month itself, not just the arrow', async () => {
		render(Calendar, { props: { today: TODAY, schedule: schedule() } });
		await waitFor(() => expect(shownDays()).toHaveLength(31));

		const toggle = foldToggle();
		expect(toggle.getAttribute('aria-expanded')).toBe('true');
		expect(headingText()).toBe('August 2026');

		await fireEvent.click(within(toggle).getByText('August 2026'));

		await waitFor(() => expect(shownDays()).toHaveLength(7));
		expect(foldToggle().getAttribute('aria-expanded')).toBe('false');
	});

	it('folds down to the week of the selected day, and back out again', async () => {
		render(Calendar, { props: { today: TODAY, schedule: schedule() } });

		await waitFor(() => expect(shownDays()).toHaveLength(31));

		await fireEvent.click(foldToggle());

		await waitFor(() => expect(shownDays()).toEqual(['24', '25', '26', '27', '28', '29', '30']));
		expect(headingText()).toBe('24 – 30 August 2026');

		await fireEvent.click(foldToggle());

		await waitFor(() => expect(shownDays()).toHaveLength(31));
		expect(headingText()).toBe('August 2026');
	});

	it('steps a week at a time while folded, into the next month', async () => {
		render(Calendar, { props: { today: TODAY, schedule: schedule() } });

		await waitFor(() => expect(shownDays()).toHaveLength(31));
		await fireEvent.click(foldToggle());
		await waitFor(() => expect(shownDays()).toHaveLength(7));

		await fireEvent.click(screen.getByRole('button', { name: 'Next week' }));

		await waitFor(() => expect(shownDays()).toEqual(['31', '1', '2', '3', '4', '5', '6']));
		expect(headingText()).toBe('31 Aug – 6 Sep 2026');
	});
});

describe('the view the screen opens on', () => {
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
	afterEach(() => {
		vi.unstubAllGlobals();
		document.cookie = 'calendar-view=; Max-Age=0; Path=/';
	});

	it('opens on the week on a phone', async () => {
		stubViewport(390);
		render(Calendar, { props: { today: TODAY, schedule: schedule() } });

		await waitFor(() => expect(shownDays()).toEqual(['24', '25', '26', '27', '28', '29', '30']));
		expect(foldToggle().getAttribute('aria-expanded')).toBe('false');
	});

	it('opens on the month on a desktop', async () => {
		stubViewport(1280);
		render(Calendar, { props: { today: TODAY, schedule: schedule() } });

		await waitFor(() => expect(shownDays()).toHaveLength(31));
	});

	it('folds and unfolds again as the window crosses the breakpoint', async () => {
		const resize = stubViewport(1280);
		render(Calendar, { props: { today: TODAY, schedule: schedule() } });
		await waitFor(() => expect(shownDays()).toHaveLength(31));

		resize(390);
		await waitFor(() => expect(shownDays()).toHaveLength(7));

		resize(1280);
		await waitFor(() => expect(shownDays()).toHaveLength(31));
	});

	/**
	 * The server has no viewport, so it renders whatever view this cookie
	 * last said (`#lib/utils/opening-view`). It is the media query's answer
	 * that is remembered, because after a reload the query decides again.
	 */
	it('remembers what the screen asked for, for the next page the server draws', async () => {
		const resize = stubViewport(390);
		render(Calendar, { props: { today: TODAY, schedule: schedule() } });
		await waitFor(() => expect(document.cookie).toContain('calendar-view=week'));

		resize(1280);
		await waitFor(() => expect(document.cookie).toContain('calendar-view=month'));
	});

	it('stays on the week it was opened folded on when the screen agrees', async () => {
		stubViewport(390);
		render(Calendar, { props: { today: TODAY, schedule: schedule(), openingView: 'week' } });

		expect(shownDays()).toEqual(['24', '25', '26', '27', '28', '29', '30']);
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(shownDays()).toEqual(['24', '25', '26', '27', '28', '29', '30']);
	});

	/**
	 * Folding asks for the month either side of the week; opened folded on
	 * the server, nothing could be asked for, and the media query then finds
	 * the calendar already folded and asks for nothing either. Monday 31
	 * August folds onto a week that runs into September.
	 */
	it('fetches the month a week opened folded reaches into', async () => {
		stubViewport(390);
		const monday = new Date(2026, 7, 31, 8, 0);
		render(Calendar, {
			props: {
				today: monday,
				schedule: schedule({ trainings: [training('2026-08-31')] }),
				openingView: 'week'
			}
		});

		expect(shownDays()).toEqual(['31', '1', '2', '3', '4', '5', '6']);

		// Straight away, as a fold would — not a second later, when the idle
		// prefetch of the weeks either side would have got round to it.
		await new Promise((resolve) => setTimeout(resolve, 50));
		const asked = vi.mocked(fetch).mock.calls.map(([url]) => String(url));
		expect(asked.some((url) => url.includes('/api/v1/schedule?date=2026-09-01'))).toBe(true);
	});

	it('leaves the view alone once the runner has set it themselves', async () => {
		const resize = stubViewport(390);
		render(Calendar, { props: { today: TODAY, schedule: schedule() } });
		await waitFor(() => expect(shownDays()).toHaveLength(7));

		await fireEvent.click(foldToggle());
		await waitFor(() => expect(shownDays()).toHaveLength(31));

		resize(1280);
		resize(390);
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(shownDays()).toHaveLength(31);
	});
});
