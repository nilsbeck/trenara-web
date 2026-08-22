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

	it('posts surface and elevation together', async () => {
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
				body: JSON.stringify({ surface: 'single_track', heightDifference: 'strong' })
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

	it('drops the cached alternatives once the workout is replaced', async () => {
		const fetchMock = vi.mocked(fetch);
		fetchMock.mockResolvedValueOnce(jsonResponse(detail()));
		const store = new SessionDetailStore();
		store.load(42);
		await vi.waitFor(() => expect(store.detail).not.toBeNull());

		fetchMock.mockResolvedValueOnce(jsonResponse([{ id: 20112 }]));
		await store.loadCandidates();
		expect(store.candidates).toHaveLength(1);

		fetchMock.mockResolvedValueOnce(jsonResponse(detail({ title: 'Easy run' })));
		await store.exchange(20112);

		// They described the session that is no longer there.
		expect(store.candidates).toBeNull();
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
