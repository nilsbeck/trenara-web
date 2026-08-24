import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
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

describe('while the detail is still loading', () => {
	/** A response that only lands when the test says so. */
	function deferred() {
		let settle!: (value: unknown) => void;
		return { promise: new Promise((resolve) => (settle = resolve)), settle };
	}

	it('says the setup is loading until the chips arrive', async () => {
		const detailResponse = deferred();
		vi.stubGlobal('fetch', vi.fn().mockReturnValue(detailResponse.promise));

		render(TrainingDetails, {
			props: { selectedDate: '2026-08-22', training: base, entry: null, isLoading: false }
		});

		// The week payload carries no capability flags, so the chips cannot be
		// drawn yet — but the row is where it will be, and it says what it is
		// waiting on rather than sitting there as empty grey pills.
		await waitFor(() => expect(screen.getByTestId('setup-rail-loading')).toBeTruthy());
		expect(screen.getByText('Loading setup…')).toBeTruthy();

		detailResponse.settle({ ok: true, status: 200, json: async () => detail });

		await waitFor(() => expect(screen.getAllByText('Treadmill · Flat').length).toBeGreaterThan(0));
		expect(screen.queryByTestId('setup-rail-loading')).toBeNull();
		vi.unstubAllGlobals();
	});

	it('puts the rail up from the week copy and fills the values when the detail lands', async () => {
		// What Trenara actually sends with the week: the capability flags, but
		// no training_condition, no suggested_shoe and no change packages.
		const week = {
			...base,
			can_cross_train: true,
			can_be_exchanged: true,
			can_change_intensity: true
		};
		const detailResponse = deferred();
		vi.stubGlobal('fetch', vi.fn().mockReturnValue(detailResponse.promise));

		render(TrainingDetails, {
			props: { selectedDate: '2026-08-22', training: week, entry: null, isLoading: false }
		});

		// The chips are there on the first paint, because the flags say which
		// settings exist. Each one whose value only the detail carries spins in
		// place rather than claiming the setting is unset.
		const terrain = await waitFor(() => screen.getByRole('button', { name: /Terrain/ }));
		expect(terrain.getAttribute('aria-busy')).toBe('true');
		expect(screen.getByRole('button', { name: /Effort/ }).getAttribute('aria-busy')).toBe('true');
		expect(screen.queryByTestId('setup-rail-loading')).toBeNull();

		detailResponse.settle({ ok: true, status: 200, json: async () => detail });

		await waitFor(() => expect(screen.getAllByText('Treadmill · Flat').length).toBeGreaterThan(0));
		expect(screen.getByRole('button', { name: /Treadmill · Flat/ }).getAttribute('aria-busy')).toBe(
			null
		);
		vi.unstubAllGlobals();
	});

	it('renders the rail from the week copy when that already carries the flags', async () => {
		// Whether Trenara sends the capability flags with the week is not
		// something this app gets to know in advance, and nothing in the path
		// would strip them if it did: the client casts res.json() and the
		// schedule route re-serialises each training whole. So a week copy that
		// has them is used as-is, and the fetch only confirms it.
		const detailResponse = deferred();
		vi.stubGlobal('fetch', vi.fn().mockReturnValue(detailResponse.promise));

		render(TrainingDetails, {
			props: { selectedDate: '2026-08-22', training: detail, entry: null, isLoading: false }
		});

		await waitFor(() => expect(screen.getAllByText('Treadmill · Flat').length).toBeGreaterThan(0));
		expect(screen.queryByTestId('setup-rail-loading')).toBeNull();

		detailResponse.settle({ ok: true, status: 200, json: async () => detail });
		vi.unstubAllGlobals();
	});

	it('promises no rail on a session the plan pins', async () => {
		const detailResponse = deferred();
		vi.stubGlobal('fetch', vi.fn().mockReturnValue(detailResponse.promise));

		render(TrainingDetails, {
			props: {
				selectedDate: '2026-08-22',
				training: { ...base, can_be_edited: false },
				entry: null,
				isLoading: false
			}
		});

		// can_be_edited is already known from the week, and it is false on the
		// goal race: a loading rail there would advertise controls that never
		// come.
		await waitFor(() => expect(screen.getAllByText('Tempo run').length).toBeGreaterThan(0));
		expect(screen.queryByTestId('setup-rail-loading')).toBeNull();

		detailResponse.settle({ ok: true, status: 200, json: async () => detail });
		vi.unstubAllGlobals();
	});

	it('spins while the shoe locker is being fetched', async () => {
		const shoesResponse = deferred();
		const fetchMock = vi.fn().mockImplementation((url: string) => {
			if (url === '/api/v1/shoes') return shoesResponse.promise;
			return Promise.resolve({ ok: true, status: 200, json: async () => detail });
		});
		vi.stubGlobal('fetch', fetchMock);

		render(TrainingDetails, {
			props: { selectedDate: '2026-08-22', training: base, entry: null, isLoading: false }
		});

		await waitFor(() => expect(screen.getAllByText('Shoe').length).toBeGreaterThan(0));
		await fireEvent.click(screen.getAllByText('Shoe')[0]);

		// The locker is a second fetch, made the first time the picker opens.
		await waitFor(() => expect(screen.getByText(/Loading your shoes/)).toBeTruthy());

		shoesResponse.settle({ ok: true, status: 200, json: async () => [] });
		await waitFor(() => expect(screen.getByText('No shoes in your locker yet.')).toBeTruthy());
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

	it('shows a removed cool-down in the plan rather than on a chip', async () => {
		const dropped = { ...withCooldown, has_cooldown: false };
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => dropped })
		);

		render(TrainingDetails, {
			props: { selectedDate: '2026-08-22', training: base, entry: null, isLoading: false }
		});

		// The ghost row says it, in the place the block is missing from; a chip
		// would spend a row of the rail saying it twice.
		await waitFor(() => expect(screen.getByText('Cool-down removed')).toBeTruthy());
		expect(screen.queryByText('No cool-down')).toBeNull();
		vi.unstubAllGlobals();
	});

	it('makes the whole cool-down row the control, not a button parked in it', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce({ ok: true, status: 200, json: async () => withCooldown })
			.mockResolvedValueOnce({ ok: true, status: 200, json: async () => withCooldown });
		vi.stubGlobal('fetch', fetchMock);

		render(TrainingDetails, {
			props: { selectedDate: '2026-08-22', training: base, entry: null, isLoading: false }
		});

		// Clicking the block's own text works, which a trailing pill would not
		// have allowed — the row is the target.
		const row = await waitFor(() => screen.getByRole('button', { name: /Cool-down: 2km easy/ }));
		await fireEvent.click(row);

		await waitFor(() =>
			expect(fetchMock).toHaveBeenLastCalledWith(
				'/api/v1/training/42/cooldown',
				expect.objectContaining({ body: JSON.stringify({ hasCooldown: false }) })
			)
		);
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

describe('terrain climb', () => {
	const withCondition: ScheduledTraining = {
		...detail,
		training_condition: {
			id: 1,
			height_difference: 'strong',
			surface: 'single_track',
			updated_at: 0,
			height: null,
			height_value: 450,
			height_unit: 'm'
		}
	};

	it('shows the climb on the terrain chip once it is set', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => withCondition })
		);

		render(TrainingDetails, {
			props: { selectedDate: '2026-08-22', training: base, entry: null, isLoading: false }
		});

		await waitFor(() =>
			expect(screen.getAllByText('Single track · Very hilly · 450 m').length).toBeGreaterThan(0)
		);
		vi.unstubAllGlobals();
	});

	it('opens the editor with the stored climb and sends an edited one', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce({ ok: true, status: 200, json: async () => withCondition })
			.mockResolvedValueOnce({ ok: true, status: 200, json: async () => withCondition });
		vi.stubGlobal('fetch', fetchMock);

		render(TrainingDetails, {
			props: { selectedDate: '2026-08-22', training: base, entry: null, isLoading: false }
		});

		await waitFor(() =>
			expect(screen.getAllByText('Single track · Very hilly · 450 m').length).toBeGreaterThan(0)
		);
		await fireEvent.click(screen.getAllByText('Single track · Very hilly · 450 m')[0]);

		const climb = await waitFor(() => screen.getByRole('spinbutton'));
		expect((climb as HTMLInputElement).value).toBe('450');

		await fireEvent.input(climb, { target: { value: '620' } });
		await fireEvent.click(screen.getByText('Apply'));

		// Surface and elevation ride along untouched: the endpoint refuses a
		// partial condition rather than merging one.
		await waitFor(() =>
			expect(fetchMock).toHaveBeenLastCalledWith(
				'/api/v1/training/42/condition',
				expect.objectContaining({
					body: JSON.stringify({
						surface: 'single_track',
						heightDifference: 'strong',
						heightValue: 620
					})
				})
			)
		);
		vi.unstubAllGlobals();
	});

	it('refuses to apply a climb that is not a sane number', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => withCondition })
		);

		render(TrainingDetails, {
			props: { selectedDate: '2026-08-22', training: base, entry: null, isLoading: false }
		});

		await waitFor(() =>
			expect(screen.getAllByText('Single track · Very hilly · 450 m').length).toBeGreaterThan(0)
		);
		await fireEvent.click(screen.getAllByText('Single track · Very hilly · 450 m')[0]);

		const climb = await waitFor(() => screen.getByRole('spinbutton'));
		await fireEvent.input(climb, { target: { value: '-5' } });

		expect(screen.getByText(/altitude in metres/i)).toBeTruthy();
		expect((screen.getByText('Apply') as HTMLButtonElement).disabled).toBe(true);
		vi.unstubAllGlobals();
	});
});

describe('switching back to a run', () => {
	const bike: ScheduledTraining = {
		...detail,
		title: 'Cycling',
		cross_type: 'road_bike',
		training_condition: null,
		suggested_shoe: null
	};

	it('offers Run as a choice on a cross-trained session', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce({ ok: true, status: 200, json: async () => bike })
			.mockResolvedValueOnce({ ok: true, status: 200, json: async () => detail });
		vi.stubGlobal('fetch', fetchMock);

		render(TrainingDetails, {
			props: { selectedDate: '2026-08-22', training: base, entry: null, isLoading: false }
		});

		await waitFor(() => expect(screen.getAllByText('Cycling').length).toBeGreaterThan(0));
		await fireEvent.click(screen.getByLabelText('Session setup'));
		await fireEvent.click(await waitFor(() => screen.getByText('Session')));

		// The tile was disabled back when reverting was thought to be an
		// exchange, which left it visible and dead.
		const run = await waitFor(() => screen.getByRole('button', { name: 'Run' }));
		expect((run as HTMLButtonElement).disabled).toBe(false);

		await fireEvent.click(run);
		await waitFor(() =>
			expect(fetchMock).toHaveBeenLastCalledWith(
				'/api/v1/training/42/cross-train',
				expect.objectContaining({ body: JSON.stringify({ crossType: null }) })
			)
		);
		vi.unstubAllGlobals();
	});

	it('does not offer the activity the session already is', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => bike })
		);

		render(TrainingDetails, {
			props: { selectedDate: '2026-08-22', training: base, entry: null, isLoading: false }
		});

		await waitFor(() => expect(screen.getAllByText('Cycling').length).toBeGreaterThan(0));
		await fireEvent.click(screen.getByLabelText('Session setup'));
		await fireEvent.click(await waitFor(() => screen.getByText('Session')));

		// The card's title is a button named "Cycling" too now, so name alone no
		// longer identifies the tile — aria-pressed does.
		const tile = await waitFor(() => {
			const found = screen
				.getAllByRole('button', { name: 'Cycling' })
				.find((b) => b.hasAttribute('aria-pressed'));
			if (!found) throw new Error('activity tile not rendered yet');
			return found;
		});
		expect((tile as HTMLButtonElement).disabled).toBe(true);
		vi.unstubAllGlobals();
	});
});

describe('changing the session from the card', () => {
	const swappable: ScheduledTraining = { ...detail, can_cross_train: true, can_be_exchanged: true };

	it('opens the session editor straight from the title', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce({ ok: true, status: 200, json: async () => swappable })
			.mockResolvedValue({ ok: true, status: 200, json: async () => [] });
		vi.stubGlobal('fetch', fetchMock);

		render(TrainingDetails, {
			props: { selectedDate: '2026-08-22', training: base, entry: null, isLoading: false }
		});

		// Two taps deep behind the sliders chip put the biggest change furthest
		// away, while the small tweaks sat on the card as chips.
		const title = await waitFor(() => screen.getByRole('button', { name: /Tempo run/ }));
		await fireEvent.click(title);

		await waitFor(() => expect(screen.getByText('Change this session')).toBeTruthy());
		vi.unstubAllGlobals();
	});

	it('leaves the title a plain heading when nothing can replace the session', async () => {
		const locked = { ...detail, can_cross_train: false, can_be_exchanged: false };
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => locked })
		);

		render(TrainingDetails, {
			props: { selectedDate: '2026-08-22', training: base, entry: null, isLoading: false }
		});

		await waitFor(() => expect(screen.getAllByText('Treadmill · Flat').length).toBeGreaterThan(0));
		expect(screen.queryByRole('button', { name: /Tempo run/ })).toBeNull();
		vi.unstubAllGlobals();
	});
});

describe('the pacing plan on race day', () => {
	// The goal race as the API sends it: pinned, so nothing about the session
	// may be edited — yet the pacing plan and the intensity are both open.
	const raceDay: ScheduledTraining = {
		...base,
		title: '15k nocturno',
		type: 'goal',
		can_be_edited: false,
		can_cross_train: false,
		cross_type: null,
		can_be_exchanged: false,
		can_change_distance: false,
		change_distance_package: null,
		can_change_intensity: true,
		change_intensity_package: {
			title: 'Fine-tune intensity',
			text: 'Change today’s session intensity.',
			steps: [{ step: 1, value: 0, text: 'As planned', selected: true }]
		},
		can_change_pacing_plan: true,
		change_pacing_plan_package: [
			{
				order: 1,
				value: 'trenara',
				title: 'Pacing plan',
				description: 'All roads lead to Rome, but this is my preferred pacing plan.',
				selected: false
			},
			{
				order: 2,
				value: 'alternative',
				title: 'Plan B',
				description: 'Always have a plan B in place.',
				selected: false
			},
			{
				order: 3,
				value: null,
				title: 'No pacing plan',
				description: 'One block at your selected pace.',
				selected: true
			}
		],
		training_condition: null,
		suggested_shoe: null
	};

	it('shows the three strategies on the card, with the coach’s copy', async () => {
		// The regression: can_be_edited is false here, and the card used to read
		// that as "nothing is changeable" and render no setup at all — on the one
		// session in the plan whose pacing plan is the whole point.
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => raceDay })
		);

		render(TrainingDetails, {
			props: {
				selectedDate: '2026-09-27',
				training: { ...base, title: '15k nocturno', can_be_edited: false },
				entry: null,
				isLoading: false
			}
		});

		await waitFor(() => expect(screen.getByText('Plan B')).toBeTruthy());

		// One choice from a fixed set, so they are radios rather than a row of
		// buttons imitating them — and each is named by its own row, so the
		// coach's copy is part of what a screen reader announces rather than
		// text sitting nearby.
		const radios = screen.getAllByRole('radio');
		expect(radios).toHaveLength(3);
		expect(screen.getByRole('radio', { name: /All roads lead to Rome/ })).toBeTruthy();
		expect(screen.getByRole('radio', { name: /Always have a plan B in place/ })).toBeTruthy();
		expect(screen.getByRole('radio', { name: /No pacing plan/ })).toBeTruthy();

		// The applied strategy is the one that reads as checked.
		expect((radios[2] as HTMLInputElement).checked).toBe(true);

		vi.unstubAllGlobals();
	});

	it('sends the strategy the runner picked', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce({ ok: true, status: 200, json: async () => raceDay })
			.mockResolvedValue({ ok: true, status: 200, json: async () => raceDay });
		vi.stubGlobal('fetch', fetchMock);

		render(TrainingDetails, {
			props: {
				selectedDate: '2026-09-27',
				training: { ...base, title: '15k nocturno', can_be_edited: false },
				entry: null,
				isLoading: false
			}
		});

		await waitFor(() => expect(screen.getByText('Plan B')).toBeTruthy());
		await fireEvent.click(screen.getAllByRole('radio')[1]);

		await waitFor(() =>
			expect(fetchMock).toHaveBeenLastCalledWith(
				'/api/v1/training/42/pacing-plan',
				expect.objectContaining({
					method: 'PUT',
					body: JSON.stringify({ pacingPlan: 'alternative' })
				})
			)
		);
		vi.unstubAllGlobals();
	});

	it('puts effort on the rail instead of a button standing in for it', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => raceDay })
		);

		render(TrainingDetails, {
			props: {
				selectedDate: '2026-09-27',
				training: { ...base, title: '15k nocturno', can_be_edited: false },
				entry: null,
				isLoading: false
			}
		});

		await waitFor(() => expect(screen.getByText('Plan B')).toBeTruthy());

		// Effort sits at the planned step, which normally keeps it off the rail.
		// With nothing else on the rail there is no noise to keep it off, and
		// "As planned" says more than a generic Session setup button would.
		expect(screen.getByRole('button', { name: 'As planned' })).toBeTruthy();
		// The button that reads "Session setup" in place of chips is gone. The
		// sliders button at the end of the rail stays — same label, no text —
		// and is still the way into the full index.
		const buttonText = screen.getAllByRole('button').map((b) => b.textContent?.trim());
		expect(buttonText).not.toContain('Session setup');
		expect(screen.getByRole('button', { name: 'Session setup' })).toBeTruthy();
		vi.unstubAllGlobals();
	});

	it('offers no terrain or shoe, which the plan has pinned', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => raceDay })
		);

		render(TrainingDetails, {
			props: {
				selectedDate: '2026-09-27',
				training: { ...base, title: '15k nocturno', can_be_edited: false },
				entry: null,
				isLoading: false
			}
		});

		await waitFor(() => expect(screen.getByText('Plan B')).toBeTruthy());
		// Those two have no flag of their own, so can_be_edited still speaks for
		// them — it is only the master-switch reading that was wrong.
		expect(screen.queryByText('Terrain')).toBeNull();
		expect(screen.queryByText('Shoe')).toBeNull();
		vi.unstubAllGlobals();
	});
});
