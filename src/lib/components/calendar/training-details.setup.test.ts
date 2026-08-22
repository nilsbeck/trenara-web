import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/svelte';
import TrainingDetails from '$lib/components/calendar/training-details.svelte';
import type { ScheduledTraining } from '$lib/server/trenara/types';

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

afterEach(cleanup);

describe('training-details session setup', () => {
	it('shows the chip rail once the detail lands', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => detail })
		);

		render(TrainingDetails, {
			props: { selectedDate: '2026-08-22', training: base, entry: null, isLoading: false }
		});

		await waitFor(() => expect(screen.getAllByText('Treadmill · Flat').length).toBeGreaterThan(0));

		// The chip rail shows the standing setup and the one dial that differs
		// from the plan; volume is absent because can_change_distance is false.
		const chips = screen
			.getAllByRole('button')
			.map((b) => b.textContent?.trim())
			.filter(Boolean);
		expect(chips).toContain('Treadmill · Flat');
		expect(chips).toContain('Shoe');
		expect(chips).toContain('A bit slower');
		expect(chips).not.toContain('Volume');

		expect(screen.getByLabelText('Start treadmill mode')).toBeTruthy();
		vi.unstubAllGlobals();
	});

	it('drops treadmill mode and the running settings on a cross-trained session', async () => {
		const bike = { ...detail, cross_type: 'road_bike', title: 'Cycling', training_condition: null };
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => bike })
		);

		render(TrainingDetails, {
			props: { selectedDate: '2026-08-22', training: base, entry: null, isLoading: false }
		});

		await waitFor(() => expect(screen.getAllByText('Cycling').length).toBeGreaterThan(0));

		// A ride has no pace to hold on a belt, and no terrain or shoe either.
		expect(screen.queryByLabelText('Start treadmill mode')).toBeNull();
		expect(screen.queryByText('Shoe')).toBeNull();
		expect(screen.queryByText('Terrain')).toBeNull();
		vi.unstubAllGlobals();
	});
});

describe('cool-down', () => {
	/** A session with a cool-down it is allowed to drop. */
	const withCooldown: ScheduledTraining = {
		...detail,
		can_toggle_cooldown: true,
		has_cooldown: true,
		training: {
			...detail.training,
			blocks: [
				{ order: 1, type: 'warmup', hex_graph: '#90CFF1', text: 'Warm-up: 2km' },
				{ order: 2, type: 'run', hex_graph: '#E69F00', text: 'Run 8km' },
				{ order: 3, type: 'cooldown', hex_graph: '#90CFF1', text: 'Cool-down: 2km easy' }
			]
		}
	};

	it('offers no cool-down control on a session that has none', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => detail })
		);

		render(TrainingDetails, {
			props: { selectedDate: '2026-08-22', training: base, entry: null, isLoading: false }
		});

		await waitFor(() => expect(screen.getAllByText('Treadmill · Flat').length).toBeGreaterThan(0));
		expect(screen.queryByText('Remove')).toBeNull();
		expect(screen.queryByText('Cool-down removed')).toBeNull();
		vi.unstubAllGlobals();
	});

	it('puts Remove on the cool-down block, and swaps in a ghost row once it is gone', async () => {
		const dropped = {
			...withCooldown,
			has_cooldown: false,
			training: { ...withCooldown.training, blocks: withCooldown.training.blocks.slice(0, 2) }
		};

		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce({ ok: true, status: 200, json: async () => withCooldown })
			.mockResolvedValueOnce({ ok: true, status: 200, json: async () => dropped });
		vi.stubGlobal('fetch', fetchMock);

		render(TrainingDetails, {
			props: { selectedDate: '2026-08-22', training: base, entry: null, isLoading: false }
		});

		await waitFor(() => expect(screen.getByText('Cool-down: 2km easy')).toBeTruthy());
		await fireEvent.click(screen.getByText('Remove'));

		// The response rebuilds the training, so the block goes and the plan
		// shows what is missing rather than silently closing up.
		await waitFor(() => expect(screen.getByText('Cool-down removed')).toBeTruthy());
		expect(screen.queryByText('Cool-down: 2km easy')).toBeNull();
		expect(screen.getByText('Add back')).toBeTruthy();

		expect(fetchMock).toHaveBeenLastCalledWith(
			'/api/v1/training/42/cooldown',
			expect.objectContaining({ body: JSON.stringify({ hasCooldown: false }) })
		);
		vi.unstubAllGlobals();
	});

	it('chips a removed cool-down so the deviation is visible without scrolling', async () => {
		const dropped = { ...withCooldown, has_cooldown: false };
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => dropped })
		);

		render(TrainingDetails, {
			props: { selectedDate: '2026-08-22', training: base, entry: null, isLoading: false }
		});

		await waitFor(() => expect(screen.getAllByText('No cool-down').length).toBeGreaterThan(0));
		vi.unstubAllGlobals();
	});

	it('gives the control its own row when the block cannot be identified', async () => {
		// has_cooldown is true, but no block names itself as the cool-down.
		const unnamed = {
			...withCooldown,
			training: { ...withCooldown.training, blocks: withCooldown.training.blocks.slice(0, 2) }
		};
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => unnamed })
		);

		render(TrainingDetails, {
			props: { selectedDate: '2026-08-22', training: base, entry: null, isLoading: false }
		});

		// Attaching it to whichever block happened to be last would mislabel one,
		// so the control appears on a row of its own. "Remove" is what marks it:
		// the sheet's switch names the cool-down too, but never offers that.
		await waitFor(() => expect(screen.getByText('Remove')).toBeTruthy());
		expect(screen.getAllByText('Cool-down').length).toBeGreaterThan(0);
		expect(screen.queryByText('Cool-down removed')).toBeNull();
		vi.unstubAllGlobals();
	});
});

describe('setup errors outside the sheet', () => {
	const withCooldown: ScheduledTraining = {
		...detail,
		can_toggle_cooldown: true,
		has_cooldown: true,
		training: {
			...detail.training,
			blocks: [
				{ order: 1, type: 'warmup', hex_graph: '#90CFF1', text: 'Warm-up: 2km' },
				{ order: 2, type: 'cooldown', hex_graph: '#90CFF1', text: 'Cool-down: 2km easy' }
			]
		}
	};

	it('shows why a refused cool-down change did nothing', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce({ ok: true, status: 200, json: async () => withCooldown })
			.mockResolvedValueOnce({
				ok: false,
				status: 404,
				json: async () => ({ message: 'Not Found' })
			});
		vi.stubGlobal('fetch', fetchMock);

		render(TrainingDetails, {
			props: { selectedDate: '2026-08-22', training: base, entry: null, isLoading: false }
		});

		await waitFor(() => expect(screen.getByText('Cool-down: 2km easy')).toBeTruthy());
		await fireEvent.click(screen.getByText('Remove'));

		// The control is on the block, outside the sheet, so without this the
		// failure was silent and looked like a button doing nothing.
		await waitFor(() => expect(screen.getByText('Not Found')).toBeTruthy());
		expect(screen.getByText('Cool-down: 2km easy')).toBeTruthy();
		vi.unstubAllGlobals();
	});

	it('says so when the server answers but changes nothing', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce({ ok: true, status: 200, json: async () => withCooldown })
			.mockResolvedValueOnce({ ok: true, status: 200, json: async () => withCooldown });
		vi.stubGlobal('fetch', fetchMock);

		render(TrainingDetails, {
			props: { selectedDate: '2026-08-22', training: base, entry: null, isLoading: false }
		});

		await waitFor(() => expect(screen.getByText('Cool-down: 2km easy')).toBeTruthy());
		await fireEvent.click(screen.getByText('Remove'));

		await waitFor(() => expect(screen.getByText(/did not remove the cool-down/i)).toBeTruthy());
		vi.unstubAllGlobals();
	});
});
