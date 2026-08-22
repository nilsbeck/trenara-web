import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ScheduledTrainingDetail } from '$lib/server/trenara/types';
import { SessionDetailStore } from './session-detail.svelte';

function detail(overrides: Partial<ScheduledTrainingDetail> = {}): ScheduledTrainingDetail {
	return {
		id: 1,
		day: 0,
		day_long: '2026-08-22',
		title: 'Tempo run',
		description: '',
		show_description_from: 0,
		type: 'training',
		icon_url: '',
		hex_training: '#E69F00',
		hex_completed: null,
		last_garmin_sync: null,
		can_be_edited: true,
		training: {
			blocks: [],
			total_time_in_sec: 0,
			core_time_in_sec: 0,
			core_time: '00:00',
			core_time_value: 0,
			core_time_unit: 'sec',
			total_time: '00:00',
			total_time_value: 0,
			total_time_unit: 'sec'
		},
		...overrides
	};
}

function jsonResponse(body: unknown, status = 200): Response {
	return {
		ok: status >= 200 && status < 300,
		status,
		json: async () => body
	} as Response;
}

/** Resolves the next fetch only when the test says so. */
function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((r) => (resolve = r));
	return { promise, resolve };
}

describe('SessionDetailStore', () => {
	beforeEach(() => {
		vi.stubGlobal('fetch', vi.fn());
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('fetches the detail a selected training needs', async () => {
		const fetchMock = vi.mocked(fetch);
		fetchMock.mockResolvedValue(jsonResponse(detail({ title: 'Tempo run' })));

		const store = new SessionDetailStore();
		store.load(42);
		await vi.waitFor(() => expect(store.detail).not.toBeNull());

		expect(fetchMock).toHaveBeenCalledWith('/api/v1/training/42', expect.anything());
		expect(store.detail?.title).toBe('Tempo run');
	});

	it('does not refetch a training it is already showing', async () => {
		const fetchMock = vi.mocked(fetch);
		fetchMock.mockResolvedValue(jsonResponse(detail()));

		const store = new SessionDetailStore();
		store.load(42);
		await vi.waitFor(() => expect(store.detail).not.toBeNull());
		store.load(42);

		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('clears the detail when the selection moves to another day', async () => {
		const fetchMock = vi.mocked(fetch);
		fetchMock.mockResolvedValue(jsonResponse(detail()));

		const store = new SessionDetailStore();
		store.load(42);
		await vi.waitFor(() => expect(store.detail).not.toBeNull());

		store.load(null);
		expect(store.detail).toBeNull();
	});

	it('leaves the detail null when the fetch fails, so the card keeps the week copy', async () => {
		vi.mocked(fetch).mockResolvedValue(jsonResponse({}, 500));

		const store = new SessionDetailStore();
		store.load(42);
		await vi.waitFor(() => expect(store.loading).toBe(false));

		expect(store.detail).toBeNull();
	});

	it('replaces the whole training with the mutation response', async () => {
		const fetchMock = vi.mocked(fetch);
		fetchMock.mockResolvedValueOnce(jsonResponse(detail({ title: 'Tempo run' })));

		const store = new SessionDetailStore();
		store.load(42);
		await vi.waitFor(() => expect(store.detail).not.toBeNull());

		// Every mutation hands back the complete training — the workout, its
		// blocks and its flags can all change, so nothing is merged by hand.
		fetchMock.mockResolvedValueOnce(
			jsonResponse(detail({ title: 'Easy run', can_change_distance: true }))
		);
		await store.setEffort(-2);

		expect(store.detail?.title).toBe('Easy run');
		expect(store.detail?.can_change_distance).toBe(true);
	});

	it('sends the effort step as a percentage delta', async () => {
		const fetchMock = vi.mocked(fetch);
		fetchMock.mockResolvedValueOnce(jsonResponse(detail()));
		const store = new SessionDetailStore();
		store.load(42);
		await vi.waitFor(() => expect(store.detail).not.toBeNull());

		fetchMock.mockResolvedValueOnce(jsonResponse(detail()));
		await store.setEffort(-4);

		expect(fetchMock).toHaveBeenLastCalledWith(
			'/api/v1/training/42/intensity',
			expect.objectContaining({ method: 'PUT', body: JSON.stringify({ intensityValue: -4 }) })
		);
	});

	it('posts the whole condition to one endpoint', async () => {
		const fetchMock = vi.mocked(fetch);
		fetchMock.mockResolvedValueOnce(jsonResponse(detail()));
		const store = new SessionDetailStore();
		store.load(42);
		await vi.waitFor(() => expect(store.detail).not.toBeNull());

		fetchMock.mockResolvedValueOnce(jsonResponse(detail()));
		await store.setTerrain('single_track', 'strong');

		expect(fetchMock).toHaveBeenLastCalledWith(
			'/api/v1/training/42/condition',
			expect.objectContaining({
				method: 'POST',
				body: JSON.stringify({
					surface: 'single_track',
					heightDifference: 'strong',
					heightValue: 0
				})
			})
		);
	});

	it('sends the climb with the terrain, defaulting to zero', async () => {
		const fetchMock = vi.mocked(fetch);
		fetchMock.mockResolvedValueOnce(jsonResponse(detail()));
		const store = new SessionDetailStore();
		store.load(42);
		await vi.waitFor(() => expect(store.detail).not.toBeNull());

		fetchMock.mockResolvedValueOnce(jsonResponse(detail()));
		await store.setTerrain('single_track', 'strong', 450);
		expect(fetchMock).toHaveBeenLastCalledWith(
			'/api/v1/training/42/condition',
			expect.objectContaining({
				body: JSON.stringify({
					surface: 'single_track',
					heightDifference: 'strong',
					heightValue: 450
				})
			})
		);

		// The endpoint rejects a partial condition rather than merging one, so
		// the climb travels even when the caller never mentions it.
		fetchMock.mockResolvedValueOnce(jsonResponse(detail()));
		await store.setTerrain('road', 'flat');
		expect(fetchMock).toHaveBeenLastCalledWith(
			'/api/v1/training/42/condition',
			expect.objectContaining({
				body: JSON.stringify({ surface: 'road', heightDifference: 'flat', heightValue: 0 })
			})
		);
	});

	it('refuses a second change while one is in flight', async () => {
		const fetchMock = vi.mocked(fetch);
		fetchMock.mockResolvedValueOnce(jsonResponse(detail()));
		const store = new SessionDetailStore();
		store.load(42);
		await vi.waitFor(() => expect(store.detail).not.toBeNull());

		// These calls all rewrite the same training, so overlapping them would
		// leave whichever response landed last to win arbitrarily.
		const gate = deferred<Response>();
		fetchMock.mockReturnValueOnce(gate.promise);
		const first = store.setEffort(-2);

		const second = await store.setVolume(-10);
		expect(second).toBe(false);
		expect(store.error).toMatch(/still saving/i);

		gate.resolve(jsonResponse(detail()));
		expect(await first).toBe(true);
	});

	it('keeps the last confirmed state when a change fails', async () => {
		const fetchMock = vi.mocked(fetch);
		fetchMock.mockResolvedValueOnce(jsonResponse(detail({ title: 'Tempo run' })));
		const store = new SessionDetailStore();
		store.load(42);
		await vi.waitFor(() => expect(store.detail).not.toBeNull());

		fetchMock.mockResolvedValueOnce(jsonResponse({ message: 'Not allowed today' }, 422));
		const ok = await store.setEffort(-4);

		// Nothing was applied optimistically, so there is nothing to roll back.
		expect(ok).toBe(false);
		expect(store.detail?.title).toBe('Tempo run');
		expect(store.error).toBe('Not allowed today');
		expect(store.pending).toBeNull();
	});

	it('sends a null cross type to turn the session back into a run', async () => {
		const fetchMock = vi.mocked(fetch);
		fetchMock.mockResolvedValueOnce(jsonResponse(detail({ cross_type: 'road_bike' })));
		const store = new SessionDetailStore();
		store.load(42);
		await vi.waitFor(() => expect(store.detail).not.toBeNull());

		fetchMock.mockResolvedValueOnce(jsonResponse(detail({ cross_type: null })));
		await store.crossTrain(null);

		expect(fetchMock).toHaveBeenLastCalledWith(
			'/api/v1/training/42/cross-train',
			expect.objectContaining({ body: JSON.stringify({ crossType: null }) })
		);
		expect(store.detail?.cross_type).toBeNull();
	});

	it('sends the target cool-down state, not a flip', async () => {
		const fetchMock = vi.mocked(fetch);
		fetchMock.mockResolvedValueOnce(jsonResponse(detail({ has_cooldown: true })));
		const store = new SessionDetailStore();
		store.load(42);
		await vi.waitFor(() => expect(store.detail).not.toBeNull());

		// A target rather than a toggle: two taps racing each other cannot land
		// on whichever order the server happened to process.
		fetchMock.mockResolvedValueOnce(jsonResponse(detail({ has_cooldown: false })));
		await store.setCooldown(false);

		expect(fetchMock).toHaveBeenLastCalledWith(
			'/api/v1/training/42/cooldown',
			expect.objectContaining({ method: 'PUT', body: JSON.stringify({ hasCooldown: false }) })
		);
		expect(store.detail?.has_cooldown).toBe(false);
	});

	it('names the cool-down field the way the API does', async () => {
		const fetchMock = vi.mocked(fetch);
		fetchMock.mockResolvedValueOnce(jsonResponse(detail({ has_cooldown: true })));
		const store = new SessionDetailStore();
		store.load(42);
		await vi.waitFor(() => expect(store.detail).not.toBeNull());

		fetchMock.mockResolvedValueOnce(jsonResponse(detail({ has_cooldown: false })));
		await store.setCooldown(false);

		// The client route takes hasCooldown; the server layer renames it to
		// cooldown_toggle, which is what Trenara actually reads. Sending
		// has_cooldown upstream is answered 200 and ignored.
		expect(fetchMock).toHaveBeenLastCalledWith(
			'/api/v1/training/42/cooldown',
			expect.objectContaining({ body: JSON.stringify({ hasCooldown: false }) })
		);
	});

	it('reports a cool-down change the server answered but did not apply', async () => {
		const fetchMock = vi.mocked(fetch);
		fetchMock.mockResolvedValueOnce(jsonResponse(detail({ has_cooldown: true })));
		const store = new SessionDetailStore();
		store.load(42);
		await vi.waitFor(() => expect(store.detail).not.toBeNull());

		// 200, but the cool-down is still on. The endpoint shape is inferred, so
		// a silent no-op is possible here and must not read as success.
		fetchMock.mockResolvedValueOnce(jsonResponse(detail({ has_cooldown: true })));
		const ok = await store.setCooldown(false);

		expect(ok).toBe(false);
		expect(store.error).toMatch(/did not remove the cool-down/i);
	});

	it('says nothing when the cool-down change lands', async () => {
		const fetchMock = vi.mocked(fetch);
		fetchMock.mockResolvedValueOnce(jsonResponse(detail({ has_cooldown: true })));
		const store = new SessionDetailStore();
		store.load(42);
		await vi.waitFor(() => expect(store.detail).not.toBeNull());

		fetchMock.mockResolvedValueOnce(jsonResponse(detail({ has_cooldown: false })));
		expect(await store.setCooldown(false)).toBe(true);
		expect(store.error).toBeNull();
	});

	it('replaces the cached alternatives once the workout is replaced', async () => {
		const fetchMock = vi.mocked(fetch);
		fetchMock.mockResolvedValueOnce(jsonResponse(detail({ title: 'Tempo run' })));
		const store = new SessionDetailStore();
		store.load(42);
		await vi.waitFor(() => expect(store.detail).not.toBeNull());

		fetchMock.mockResolvedValueOnce(jsonResponse([{ id: 20112, title: 'Easy run' }]));
		await store.loadCandidates();
		expect(store.candidates).toHaveLength(1);

		// The old list described a session that is no longer there, so it is
		// dropped — and fetched again straight away, because the undo offer
		// depends on whether the previous session is among the new ones.
		fetchMock
			.mockResolvedValueOnce(jsonResponse(detail({ title: 'Easy run' })))
			.mockResolvedValueOnce(jsonResponse([{ id: 991, title: 'Tempo run' }]));
		await store.exchange(20112);

		expect(store.candidates).toEqual([{ id: 991, title: 'Tempo run' }]);
	});

	it('fetches the shoe locker once, when it is first needed', async () => {
		const fetchMock = vi.mocked(fetch);
		fetchMock.mockResolvedValueOnce(jsonResponse(detail()));
		const store = new SessionDetailStore();
		store.load(42);
		await vi.waitFor(() => expect(store.detail).not.toBeNull());

		fetchMock.mockResolvedValue(jsonResponse([{ id: 6404 }]));
		await store.loadShoes();
		await store.loadShoes();

		expect(fetchMock.mock.calls.filter(([url]) => url === '/api/v1/shoes')).toHaveLength(1);
	});

	it('ignores a response that arrives after the runner moved on', async () => {
		const fetchMock = vi.mocked(fetch);
		fetchMock.mockResolvedValueOnce(jsonResponse(detail({ id: 42 })));
		const store = new SessionDetailStore();
		store.load(42);
		await vi.waitFor(() => expect(store.detail).not.toBeNull());

		const gate = deferred<Response>();
		fetchMock.mockReturnValueOnce(gate.promise);
		const inFlight = store.setEffort(-2);

		store.load(43);
		gate.resolve(jsonResponse(detail({ id: 42, title: 'Stale' })));
		expect(await inFlight).toBe(false);

		expect(store.detail?.title).not.toBe('Stale');
	});
});

describe('undoing a session swap', () => {
	beforeEach(() => {
		vi.stubGlobal('fetch', vi.fn());
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	async function loaded(initial = detail()) {
		vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(initial));
		const store = new SessionDetailStore();
		store.load(42);
		await vi.waitFor(() => expect(store.detail).not.toBeNull());
		return store;
	}

	it('offers an exact undo after an activity swap', async () => {
		const store = await loaded(detail({ cross_type: null }));

		vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(detail({ cross_type: 'road_bike' })));
		await store.crossTrain('road_bike');
		expect(store.undoable?.message).toMatch(/cycling/i);

		// The inverse of a cross-train is a cross-train, so this is precise.
		vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(detail({ cross_type: null })));
		await store.undo();
		expect(vi.mocked(fetch)).toHaveBeenLastCalledWith(
			'/api/v1/training/42/cross-train',
			expect.objectContaining({ body: JSON.stringify({ crossType: null }) })
		);
	});

	it('offers to undo an exchange when the old session is still on offer', async () => {
		const store = await loaded(detail({ title: 'Tempo run' }));

		vi.mocked(fetch)
			.mockResolvedValueOnce(jsonResponse(detail({ title: 'Easy run' })))
			.mockResolvedValueOnce(jsonResponse([{ id: 991, title: 'Tempo run' }]));
		await store.exchange(20112);

		expect(store.undoable?.message).toContain('Easy run');

		vi.mocked(fetch)
			.mockResolvedValueOnce(jsonResponse(detail({ title: 'Tempo run' })))
			.mockResolvedValueOnce(jsonResponse([]));
		await store.undo();

		// Not the *last* call: exchanging refreshes the candidate list after,
		// since the ones it held describe a session that is no longer there.
		expect(vi.mocked(fetch)).toHaveBeenCalledWith(
			'/api/v1/training/42/exchange',
			expect.objectContaining({ body: JSON.stringify({ candidateId: 991 }) })
		);
	});

	it('offers no undo when the old session is not among the candidates', async () => {
		// Promising an undo that would fail on the tap is worse than not
		// offering one.
		const store = await loaded(detail({ title: 'Tempo run' }));

		vi.mocked(fetch)
			.mockResolvedValueOnce(jsonResponse(detail({ title: 'Easy run' })))
			.mockResolvedValueOnce(jsonResponse([{ id: 992, title: 'Intervals' }]));
		await store.exchange(20112);

		expect(store.undoable).toBeNull();
	});

	it('drops the offer when something else is changed', async () => {
		const store = await loaded(detail({ cross_type: null }));

		vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(detail({ cross_type: 'road_bike' })));
		await store.crossTrain('road_bike');
		expect(store.undoable).not.toBeNull();

		vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(detail()));
		await store.setEffort(-2);
		expect(store.undoable).toBeNull();
	});

	it('drops the offer when the runner moves to another day', async () => {
		const store = await loaded(detail({ cross_type: null }));

		vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(detail({ cross_type: 'road_bike' })));
		await store.crossTrain('road_bike');

		vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(detail()));
		store.load(43);
		expect(store.undoable).toBeNull();
	});

	it('does nothing when there is nothing to undo', async () => {
		const store = await loaded();
		expect(await store.undo()).toBe(false);
	});
});
