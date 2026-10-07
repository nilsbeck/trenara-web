import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { NewTrainingCandidate } from '$lib/server/trenara/types';
import { AddTrainingStore } from './add-training.svelte';

function candidate(id: number, title: string): NewTrainingCandidate {
	return {
		id,
		day: 1791583200,
		day_long: '2026-10-10',
		title,
		description: '',
		show_description_from: 0,
		type: 'training',
		icon_url: '',
		hex_training: '#90CFF1',
		hex_completed: null,
		last_garmin_sync: null,
		can_be_edited: true,
		training: {
			blocks: [],
			total_time_in_sec: 2847,
			core_time_in_sec: 2847,
			core_time: '47:27',
			core_time_value: 2847,
			core_time_unit: 'sec',
			total_time: '47:27',
			total_time_value: 2847,
			total_time_unit: 'sec'
		}
	};
}

function jsonResponse(body: unknown, status = 200): Response {
	return {
		ok: status >= 200 && status < 300,
		status,
		json: async () => body
	} as Response;
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((r) => (resolve = r));
	return { promise, resolve };
}

const recovery = candidate(24180, 'Recovery run');

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
	fetchMock = vi.fn();
	vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('AddTrainingStore', () => {
	it('starts closed and asks for nothing until opened', () => {
		const store = new AddTrainingStore('2026-10-10', vi.fn());
		expect(store.phase).toBe('closed');
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('is loading from the moment it opens, before any answer', () => {
		const pending = deferred<Response>();
		fetchMock.mockReturnValue(pending.promise);
		const store = new AddTrainingStore('2026-10-10', vi.fn());

		void store.open();

		expect(store.phase).toBe('loading');
		expect(fetchMock).toHaveBeenCalledWith('/api/v1/training/new?date=2026-10-10', {
			signal: expect.any(AbortSignal)
		});
	});

	it('lists what Trenara offers for the day', async () => {
		fetchMock.mockResolvedValue(jsonResponse({ canAdd: true, candidates: [recovery] }));
		const store = new AddTrainingStore('2026-10-10', vi.fn());

		await store.open();

		expect(store.phase).toBe('ready');
		expect(store.candidates.map((c) => c.id)).toEqual([24180]);
	});

	// Two different answers that one empty list would blur together.
	it('tells a full week apart from a day with nothing on offer', async () => {
		fetchMock.mockResolvedValueOnce(jsonResponse({ canAdd: false, candidates: [] }));
		const full = new AddTrainingStore('2026-10-10', vi.fn());
		await full.open();
		expect(full.phase).toBe('full');

		fetchMock.mockResolvedValueOnce(jsonResponse({ canAdd: true, candidates: [] }));
		const empty = new AddTrainingStore('2026-10-10', vi.fn());
		await empty.open();
		expect(empty.phase).toBe('empty');
	});

	it('says why the list failed, and can be asked again', async () => {
		fetchMock.mockResolvedValueOnce(jsonResponse({ message: 'No result found' }, 404));
		const store = new AddTrainingStore('2026-10-10', vi.fn());

		await store.open();
		expect(store.phase).toBe('failed');
		expect(store.error).toBe('No result found');

		fetchMock.mockResolvedValueOnce(jsonResponse({ canAdd: true, candidates: [recovery] }));
		await store.open();
		expect(store.phase).toBe('ready');
		expect(store.error).toBeNull();
	});

	it('drops an answer that lands after the picker was closed', async () => {
		const pending = deferred<Response>();
		fetchMock.mockReturnValue(pending.promise);
		const store = new AddTrainingStore('2026-10-10', vi.fn());

		const opening = store.open();
		store.close();
		pending.resolve(jsonResponse({ canAdd: true, candidates: [recovery] }));
		await opening;

		expect(store.phase).toBe('closed');
		expect(store.candidates).toEqual([]);
	});

	it('adds the candidate for the day, closes, and hands the owner the result', async () => {
		fetchMock.mockResolvedValueOnce(jsonResponse({ canAdd: true, candidates: [recovery] }));
		const onAdded = vi.fn();
		const store = new AddTrainingStore('2026-10-10', onAdded);
		await store.open();

		fetchMock.mockResolvedValueOnce(jsonResponse({ id: 133797044, title: 'Recovery run' }));
		expect(await store.add(24180)).toBe(true);

		const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
		expect(url).toBe('/api/v1/training/new');
		expect(init.method).toBe('POST');
		expect(JSON.parse(String(init.body))).toEqual({ date: '2026-10-10', candidateId: 24180 });
		expect(onAdded).toHaveBeenCalledWith({ id: 133797044, title: 'Recovery run' });
		expect(store.phase).toBe('closed');
		expect(store.adding).toBeNull();
	});

	it('marks which candidate is being added while it is', async () => {
		fetchMock.mockResolvedValueOnce(jsonResponse({ canAdd: true, candidates: [recovery] }));
		const store = new AddTrainingStore('2026-10-10', vi.fn());
		await store.open();

		const pending = deferred<Response>();
		fetchMock.mockReturnValueOnce(pending.promise);
		const adding = store.add(24180);
		expect(store.adding).toBe(24180);
		// A second tap while the first is out does nothing.
		expect(await store.add(24180)).toBe(false);

		pending.resolve(jsonResponse({ id: 1 }));
		await adding;
		expect(store.adding).toBeNull();
	});

	it('keeps the list up and says why when an add is refused', async () => {
		fetchMock.mockResolvedValueOnce(jsonResponse({ canAdd: true, candidates: [recovery] }));
		const onAdded = vi.fn();
		const store = new AddTrainingStore('2026-10-10', onAdded);
		await store.open();

		fetchMock.mockResolvedValueOnce(
			jsonResponse({ message: 'This week cannot take another training.' }, 409)
		);
		expect(await store.add(24180)).toBe(false);

		expect(store.phase).toBe('ready');
		expect(store.addError).toBe('This week cannot take another training.');
		expect(store.adding).toBeNull();
		expect(onAdded).not.toHaveBeenCalled();
	});
});
