import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import Calendar from './calendar.svelte';
import type { Schedule, ScheduledTraining } from '$lib/server/trenara/types';
import { SWIPE_THRESHOLD } from '$lib/utils/swipe';

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

/** The element the gesture is made on. */
function grid(): HTMLElement {
	return screen.getByRole('group', { name: /Calendar days/ });
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

/** The heading, which is itself the control that folds and unfolds the grid. */
function foldToggle(): HTMLElement {
	return within(screen.getByRole('heading', { level: 2 })).getByRole('button');
}

/**
 * Drag across the grid by `dx` pixels, and by `dy` if the gesture is not flat.
 *
 * Split into two moves so the run passes through the point where the component
 * has to decide whether the gesture is the grid's or the page's.
 */
async function drag(dx: number, dy = 0, { release = true } = {}) {
	const area = grid();
	await fireEvent.pointerDown(area, { pointerId: 1, clientX: 200, clientY: 300, button: 0 });
	await fireEvent.pointerMove(area, {
		pointerId: 1,
		clientX: 200 + dx / 2,
		clientY: 300 + dy / 2
	});
	await fireEvent.pointerMove(area, { pointerId: 1, clientX: 200 + dx, clientY: 300 + dy });
	if (release) {
		await fireEvent.pointerUp(area, { pointerId: 1, clientX: 200 + dx, clientY: 300 + dy });
	}
	return area;
}

/**
 * Wait until the calendar is not loading.
 *
 * A swipe is ignored while a fetch is in flight, the same as the arrows are
 * disabled and the overlay is over the grid — so two swipes in a row have to
 * be separated by the wait a thumb would give them anyway.
 */
async function settled() {
	await waitFor(() =>
		expect(screen.getByRole('button', { name: /Previous (week|month)/ })).toBeEnabled()
	);
}

/** Far enough to count, with a little to spare. */
const FAR = SWIPE_THRESHOLD + 20;

describe('swiping the calendar', () => {
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

	async function openMonth() {
		render(Calendar, { props: { today: TODAY, schedule: schedule() } });
		await waitFor(() => expect(shownDays()).toHaveLength(31));
		await settled();
	}

	async function openWeek() {
		await openMonth();
		await fireEvent.click(foldToggle());
		await waitFor(() => expect(shownDays()).toEqual(['24', '25', '26', '27', '28', '29', '30']));
		await settled();
	}

	it('steps to the next month on a drag to the left', async () => {
		await openMonth();

		await drag(-FAR);

		await waitFor(() => expect(headingText()).toBe('September 2026'));
		expect(shownDays()).toHaveLength(30);
	});

	it('steps to the previous month on a drag to the right', async () => {
		await openMonth();

		await drag(FAR);

		await waitFor(() => expect(headingText()).toBe('July 2026'));
	});

	it('steps a week at a time once the month is folded', async () => {
		await openWeek();

		await drag(-FAR);

		await waitFor(() => expect(shownDays()).toEqual(['31', '1', '2', '3', '4', '5', '6']));
		expect(headingText()).toBe('31 Aug – 6 Sep 2026');

		await settled();
		await drag(FAR);

		await waitFor(() => expect(shownDays()).toEqual(['24', '25', '26', '27', '28', '29', '30']));
	});

	it('stays put for a drag that stopped short of the threshold', async () => {
		await openMonth();

		await drag(-(SWIPE_THRESHOLD - 5));

		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(headingText()).toBe('August 2026');
	});

	it('leaves a mostly vertical drag to the page', async () => {
		await openMonth();

		await drag(-FAR, -200);

		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(headingText()).toBe('August 2026');
	});

	it('does not select the day the swipe started over', async () => {
		await openWeek();

		// A drag past the point where the gesture becomes the grid's, but short of
		// the step: the week stays put, so the cell the finger began on is still
		// there to be wrongly picked.
		const day = screen.getByRole('button', { name: 'Select day 28' });
		await fireEvent.pointerDown(grid(), { pointerId: 1, clientX: 200, clientY: 300, button: 0 });
		await fireEvent.pointerMove(grid(), { pointerId: 1, clientX: 180, clientY: 300 });
		await fireEvent.pointerUp(grid(), { pointerId: 1, clientX: 180, clientY: 300 });
		// The browser fires this at the cell the gesture began on, swipe or not.
		await fireEvent.click(day);

		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(day.className).not.toContain('bg-calendar-selected');
		// Today, picked when the calendar opened, is still the selected day.
		expect(screen.getByRole('button', { name: 'Select day 26' }).className).toContain(
			'bg-calendar-selected'
		);
	});

	it('still lets a plain tap through to the day underneath', async () => {
		await openWeek();

		const day = screen.getByRole('button', { name: 'Select day 28' });
		await fireEvent.pointerDown(grid(), { pointerId: 1, clientX: 200, clientY: 300, button: 0 });
		await fireEvent.pointerMove(grid(), { pointerId: 1, clientX: 202, clientY: 301 });
		await fireEvent.pointerUp(grid(), { pointerId: 1, clientX: 202, clientY: 301 });
		await fireEvent.click(day);

		await waitFor(() =>
			expect(screen.getByRole('button', { name: 'Select day 28' }).className).toContain(
				'bg-calendar-selected'
			)
		);
	});

	it('brings the new period in from the side the step came from', async () => {
		await openMonth();
		// Nothing has moved yet, so nothing slides.
		expect(grid().querySelector('[class*="slide-from-"]')).toBeNull();

		await drag(-FAR);
		await waitFor(() => expect(headingText()).toBe('September 2026'));
		expect(grid().querySelector('[class*="slide-from-right"]')).not.toBeNull();

		await settled();
		await drag(FAR);
		await waitFor(() => expect(headingText()).toBe('August 2026'));
		expect(grid().querySelector('[class*="slide-from-left"]')).not.toBeNull();
	});

	it('follows the finger while the drag is still in hand, and lets go after', async () => {
		await openMonth();

		const area = await drag(-60, 0, { release: false });
		const follower = area.querySelector<HTMLElement>('[style*="translateX"]');
		expect(follower?.style.transform).toBe('translateX(-30px)');

		await fireEvent.pointerUp(area, { pointerId: 1, clientX: 140, clientY: 300 });
		expect(follower?.style.transform).toBe('translateX(0px)');
	});
});
