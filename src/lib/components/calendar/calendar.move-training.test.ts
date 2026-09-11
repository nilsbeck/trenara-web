import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import Calendar from './calendar.svelte';
import type { Schedule, ScheduledTraining } from '$lib/server/trenara/types';

// Wednesday 2026-08-26, so "tomorrow" (the 27th) is still inside the same
// month and not in the past.
const TODAY = new Date(2026, 7, 26, 8, 0);

function training(day: string): ScheduledTraining {
	return {
		id: 900001,
		day: 0,
		day_long: day,
		title: 'Session',
		description: '',
		show_description_from: 0,
		type: 'training',
		icon_url: '',
		hex_training: '#E69F00',
		hex_completed: null,
		last_garmin_sync: null,
		can_be_edited: true,
		training: { blocks: [] }
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

// jsdom ships <dialog> without showModal/close — the "change date" modal
// cannot be driven at all without this.
beforeAll(() => {
	const proto = window.HTMLDialogElement.prototype;
	if (!proto.showModal) {
		proto.showModal = function (this: HTMLDialogElement) {
			this.open = true;
		};
	}
	if (!proto.close) {
		proto.close = function (this: HTMLDialogElement) {
			this.open = false;
			this.dispatchEvent(new Event('close'));
		};
	}
});

/**
 * Moving a session the way a runner actually does it: through the "change
 * date" modal on the session card, not through the store's own `planChanged`
 * or the calendar's "Refresh" button.
 *
 * `calendar.updates.test.ts` already proved the store seats a refreshed month
 * correctly and that the page-seed effect cannot undo it — but only by
 * driving the Refresh button by hand. A real move never touches that button:
 * it goes through `ChangeDateModal` -> `onScheduleChanged` -> `planChanged`,
 * a different call path the earlier tests never exercise. This drives that
 * one instead.
 */
describe('moving a session with the change-date modal', () => {
	let served: Schedule;

	beforeEach(() => {
		// The modal's own day-picker disables past dates against the real clock,
		// not the store's `today` prop — so the test clock has to agree with
		// `TODAY` or "tomorrow" reads as already gone.
		vi.useFakeTimers();
		vi.setSystemTime(TODAY);
		served = schedule('2026-08-26');
		vi.stubGlobal('matchMedia', () => ({
			media: '',
			matches: false,
			addEventListener: () => {},
			removeEventListener: () => {}
		}));
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url: string) => {
				const href = String(url);
				if (href.includes('/api/v1/training/move')) {
					return new Response(JSON.stringify({ goal_possible: true }), {
						status: 200,
						headers: { 'content-type': 'application/json' }
					});
				}
				if (href.includes('/api/v1/schedule')) {
					return new Response(JSON.stringify(served), {
						status: 200,
						headers: { 'content-type': 'application/json' }
					});
				}
				return new Response('{}', { status: 200 });
			})
		);
	});
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.useRealTimers();
	});

	it('shows the session on its new day right after the move, with no extra refresh', async () => {
		render(Calendar, { props: { today: TODAY, schedule: served } });

		// The opening day is today, and it has a session on it, so the panel
		// (and its "Change date" control) is there from first paint.
		await waitFor(() => expect(hasDot(26)).toBe(true));
		expect(hasDot(27)).toBe(false);

		await fireEvent.click(await screen.findByLabelText('Change date'));

		const dialog = screen.getByRole('dialog');
		const dayButtons = within(dialog)
			.getAllByRole('button', { name: '27' })
			.filter((b) => !b.hasAttribute('disabled'));
		expect(dayButtons).toHaveLength(1);
		await fireEvent.click(dayButtons[0]);

		// The backend now has the session on the 27th, same as a real move.
		served = schedule('2026-08-27');

		await fireEvent.click(within(dialog).getByRole('button', { name: /Move Training/i }));

		// No click on "Refresh", no reload — the move itself has to bring the
		// calendar up to date.
		await waitFor(() => expect(hasDot(27)).toBe(true));
		expect(hasDot(26)).toBe(false);
	});
});
