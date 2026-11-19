import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/svelte';
import TrainingDetails from '#lib/components/calendar/training-details.svelte';
import type { ScheduledTraining } from '#lib/server/trenara/types.js';

/**
 * Opening an editor on the session card, with the setup sheet's chunk held
 * back: the list the editor needs has to be on its way already, not asked for
 * once the chunk has arrived and the sheet has mounted.
 *
 * The chunk is held through `loadOnce`, which the card wraps its `import()`
 * in; every call waits on `sheet.gate`.
 */

const sheet = vi.hoisted(() => {
	let release: () => void = () => {};
	return {
		gate: Promise.resolve(),
		hold() {
			this.gate = new Promise<void>((resolve) => (release = resolve));
		},
		release: () => release()
	};
});

vi.mock('#lib/utils/load-once.js', async (importOriginal) => ({
	...(await importOriginal<typeof import('#lib/utils/load-once.js')>()),
	loadOnce:
		<T>(load: () => Promise<T>) =>
		async () => {
			await sheet.gate;
			return load();
		},
	whenIdle: () => () => {}
}));

const base: ScheduledTraining = {
	id: 42,
	day: 0,
	day_long: '2026-08-22',
	title: 'Tempo run',
	description: 'Stay aerobic today.',
	show_description_from: 0,
	type: 'training',
	icon_url: '',
	hex_training: '#E69F00',
	hex_completed: null,
	last_garmin_sync: null,
	can_be_edited: true,
	training: {
		blocks: [
			{
				order: 1,
				type: 'warmup',
				hex_graph: '#90CFF1',
				distance_value: 2,
				distance_unit: 'km',
				text: 'Warm-up: 2km'
			}
		],
		total_time_in_sec: 4068,
		core_time_in_sec: 3285,
		core_time: '54:45',
		core_time_value: 3285,
		core_time_unit: 'sec',
		total_distance: '12km',
		total_distance_value: 12,
		total_distance_unit: 'km',
		total_time: '01:07:48',
		total_time_value: 4068,
		total_time_unit: 'sec'
	}
};

const detail: ScheduledTraining = {
	...base,
	can_cross_train: true,
	cross_type: null,
	can_change_distance: false,
	change_distance_package: null,
	can_change_intensity: true,
	change_intensity_package: {
		title: 'Fine-tune intensity',
		text: 'Change today’s intensity.',
		steps: [
			{ step: 1, value: -2, text: 'A bit slower', selected: true },
			{ step: 2, value: 0, text: 'As planned', selected: false }
		]
	},
	can_be_exchanged: true,
	training_condition: {
		id: 1,
		height_difference: 'flat',
		surface: 'treadmill',
		updated_at: 0,
		height: null,
		height_unit: null
	},
	suggested_shoe: null
};

// jsdom ships <dialog> without showModal/close, so a component that opens one
// cannot be driven at all without this. It mirrors only what these tests lean
// on: the `open` property flipping, and the close event the element fires.
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

afterEach(() => {
	sheet.release();
	sheet.gate = Promise.resolve();
	cleanup();
	vi.unstubAllGlobals();
});

function serve() {
	const fetchMock = vi.fn().mockImplementation((url: string) => {
		if (url === '/api/v1/shoes') {
			return Promise.resolve({ ok: true, status: 200, json: async () => [] });
		}
		if (url === '/api/v1/training/42/exchange') {
			return Promise.resolve({ ok: true, status: 200, json: async () => [] });
		}
		return Promise.resolve({ ok: true, status: 200, json: async () => detail });
	});
	vi.stubGlobal('fetch', fetchMock);
	return fetchMock;
}

const calls = (fetchMock: ReturnType<typeof vi.fn>, url: string) =>
	fetchMock.mock.calls.filter(([u]) => u === url).length;

describe('opening a setup editor', () => {
	it('asks for the shoe locker while the sheet is still loading, and only once', async () => {
		const fetchMock = serve();
		render(TrainingDetails, {
			props: { selectedDate: '2026-08-22', training: base, entry: null, isLoading: false }
		});
		await waitFor(() => expect(screen.getAllByText('Shoe').length).toBeGreaterThan(0));

		sheet.hold();
		await fireEvent.click(screen.getAllByText('Shoe')[0]);

		// The sheet's chunk has not arrived, and the locker is already asked for.
		expect(calls(fetchMock, '/api/v1/shoes')).toBe(1);

		sheet.release();
		await waitFor(() => expect(screen.getByText('No shoes in your locker yet.')).toBeTruthy());
		// The sheet asked again as it mounted, and joined the request in flight.
		expect(calls(fetchMock, '/api/v1/shoes')).toBe(1);
	});

	it('asks for the alternatives while the sheet is still loading', async () => {
		const fetchMock = serve();
		render(TrainingDetails, {
			props: { selectedDate: '2026-08-22', training: base, entry: null, isLoading: false }
		});
		const change = await waitFor(() => screen.getByRole('button', { name: 'Change session' }));
		await waitFor(() => expect(calls(fetchMock, '/api/v1/training/42')).toBe(1));

		sheet.hold();
		await fireEvent.click(change);

		expect(calls(fetchMock, '/api/v1/training/42/exchange')).toBe(1);
	});
});
