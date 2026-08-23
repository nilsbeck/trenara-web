import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/svelte';
import TreadmillMode from '$lib/components/training/treadmill-mode.svelte';
import type { ScheduledTraining, TrainingBlock } from '$lib/server/trenara/types';

// ── Helpers ───────────────────────────────────────────────────
function makeBlock(overrides: Partial<TrainingBlock> = {}): TrainingBlock {
	return {
		order: 1,
		type: 'run',
		time: '10:00',
		time_in_sec: 600,
		time_value: 10,
		time_unit: 'min',
		distance: '2km',
		distance_value: 2,
		distance_unit: 'km',
		distance_unit_text: 'km',
		pace: '5:00',
		pace_value: 5,
		pace_unit: 'min/km',
		text: 'Run 2km',
		...overrides
	};
}

function makeTraining(blocks: TrainingBlock[]): ScheduledTraining {
	return {
		id: 1,
		day: 0,
		day_long: '2025-03-03',
		title: 'Interval session',
		description: '',
		show_description_from: 0,
		nutritional_advice: '',
		type: 'run',
		icon_url: '',
		hex_training: '#000000',
		hex_completed: null,
		training: {
			blocks,
			total_time_in_sec: 0,
			core_time_in_sec: 0,
			core_distance: '',
			core_distance_value: 0,
			core_distance_unit: 'km',
			core_distance_unit_text: 'km',
			core_time: '',
			core_time_value: 0,
			core_time_unit: 'min',
			total_distance: '',
			total_distance_value: 0,
			total_distance_unit: 'km',
			total_distance_unit_text: 'km',
			total_time: '',
			total_time_value: 0,
			total_time_unit: 'min'
		},
		last_garmin_sync: '',
		can_be_edited: true,
		training_condition: {
			id: 1,
			height_difference: '0',
			surface: 'road',
			updated_at: 0,
			height: null,
			height_value: null,
			height_unit: null,
			height_unit_text: null
		}
	};
}

const threeSteps = [
	makeBlock({ text: 'Warm up', pace_value: 6 }),
	makeBlock({ text: 'Tempo', pace_value: 4 }),
	makeBlock({ text: 'Cool down', pace_value: 6.5 })
];

/** Open treadmill mode and hand back the two visible step panes, top first. */
async function openMode(training: ScheduledTraining) {
	render(TreadmillMode, { training });
	await fireEvent.click(screen.getByLabelText('Start treadmill mode'));
	return {
		swipeArea: screen.getByTestId('treadmill-swipe-area'),
		panes: () => screen.getAllByTestId('treadmill-pane')
	};
}

/** Which slot a pane is showing ("previous" / "now" / "next") plus its step title. */
function paneSummary(pane: HTMLElement) {
	return {
		role: pane.dataset.paneRole,
		title: within(pane).getByRole('heading').textContent?.trim()
	};
}

/** Drag the swipe area vertically by `dy` pixels (negative = up). */
async function swipe(area: HTMLElement, dy: number) {
	await fireEvent.pointerDown(area, { pointerId: 1, clientY: 300 });
	await fireEvent.pointerMove(area, { pointerId: 1, clientY: 300 + dy });
	await fireEvent.pointerUp(area, { pointerId: 1, clientY: 300 + dy });
}

// jsdom ships <dialog> without the modal methods, so treadmill mode can never
// open under test unless they're stubbed. `open` drives the UA stylesheet, which
// is what keeps the dialog's content queryable.
beforeAll(() => {
	HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
		this.open = true;
	};
	HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
		this.open = false;
	};
});

afterEach(cleanup);

describe('treadmill mode split view', () => {
	it('shows the current step over the next one', async () => {
		const { panes } = await openMode(makeTraining(threeSteps));

		expect(panes()).toHaveLength(2);
		expect(paneSummary(panes()[0])).toEqual({ role: 'now', title: 'Warm up' });
		expect(paneSummary(panes()[1])).toEqual({ role: 'next', title: 'Tempo' });
	});

	it('keeps the totals prominent and the step data alongside them', async () => {
		const { panes } = await openMode(makeTraining(threeSteps));
		const now = panes()[0];

		expect(within(now).getByText('10.0 km/h')).toBeTruthy();
		// The cumulative total carries the session; the per-step numbers ride along.
		expect(within(now).getByText(/Total/).closest('p')?.textContent).toContain('2.0 km');
		expect(within(now).getByText(/Step 2km/)).toBeTruthy();
	});

	it('advances the pair with the next button', async () => {
		const { panes } = await openMode(makeTraining(threeSteps));
		await fireEvent.click(screen.getByLabelText('Next instruction'));

		expect(paneSummary(panes()[0])).toEqual({ role: 'now', title: 'Tempo' });
		expect(paneSummary(panes()[1])).toEqual({ role: 'next', title: 'Cool down' });
	});

	it('puts the active step at the bottom on the last step, with the previous one above', async () => {
		const { panes } = await openMode(makeTraining(threeSteps));
		await fireEvent.click(screen.getByLabelText('Next instruction'));
		await fireEvent.click(screen.getByLabelText('Next instruction'));

		expect(paneSummary(panes()[0])).toEqual({ role: 'previous', title: 'Tempo' });
		expect(paneSummary(panes()[1])).toEqual({ role: 'now', title: 'Cool down' });
		expect((screen.getByLabelText('Next instruction') as HTMLButtonElement).disabled).toBe(true);
	});

	it('falls back to an end marker when the session is a single step', async () => {
		const { panes } = await openMode(makeTraining([makeBlock({ text: 'Steady' })]));

		expect(paneSummary(panes()[0])).toEqual({ role: 'now', title: 'Steady' });
		expect(panes()).toHaveLength(1);
		expect(screen.getByText('End of session')).toBeTruthy();
	});

	it('renders nothing to step through when the training has no blocks', async () => {
		render(TreadmillMode, { training: makeTraining([]) });
		await fireEvent.click(screen.getByLabelText('Start treadmill mode'));

		expect(screen.getByText('No instructions available for this training.')).toBeTruthy();
	});
});

describe('treadmill mode swiping', () => {
	it('advances a step when swiping up', async () => {
		const { swipeArea, panes } = await openMode(makeTraining(threeSteps));
		await swipe(swipeArea, -80);

		expect(paneSummary(panes()[0])).toEqual({ role: 'now', title: 'Tempo' });
	});

	it('goes back a step when swiping down', async () => {
		const { swipeArea, panes } = await openMode(makeTraining(threeSteps));
		await swipe(swipeArea, -80);
		await swipe(swipeArea, 80);

		expect(paneSummary(panes()[0])).toEqual({ role: 'now', title: 'Warm up' });
	});

	it('ignores a drag that stays under the swipe threshold', async () => {
		const { swipeArea, panes } = await openMode(makeTraining(threeSteps));
		await swipe(swipeArea, -20);

		expect(paneSummary(panes()[0])).toEqual({ role: 'now', title: 'Warm up' });
	});

	it('stays put when swiping past either end of the session', async () => {
		const { swipeArea, panes } = await openMode(makeTraining(threeSteps));

		await swipe(swipeArea, 120);
		expect(paneSummary(panes()[0])).toEqual({ role: 'now', title: 'Warm up' });

		await swipe(swipeArea, -120);
		await swipe(swipeArea, -120);
		await swipe(swipeArea, -120);
		expect(paneSummary(panes()[1])).toEqual({ role: 'now', title: 'Cool down' });
	});
});
