import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { rateEntry } from './rate-entry';

function mockResponse(body: unknown, init: { status?: number } = {}) {
	const status = init.status ?? 200;
	return {
		ok: status >= 200 && status < 300,
		status,
		json: () => Promise.resolve(body)
	} as unknown as Response;
}

beforeEach(() => {
	vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('rateEntry', () => {
	it('sends the rating for the entry', async () => {
		vi.mocked(fetch).mockResolvedValueOnce(mockResponse({ rpe: 7 }));

		await rateEntry(29442588, 7);

		const [url, init] = vi.mocked(fetch).mock.calls[0];
		expect(url).toBe('/api/v1/feedback');
		expect(init?.method).toBe('PUT');
		expect(JSON.parse(init?.body as string)).toEqual({ entryId: 29442588, feedback: 7 });
	});

	it('reads the rating back off the entry the API returns', async () => {
		vi.mocked(fetch).mockResolvedValueOnce(mockResponse({ id: 1, rpe: 7 }));

		await expect(rateEntry(1, 7)).resolves.toEqual({ status: 'stored', rpe: 7 });
	});

	it('finds the entry one level in', async () => {
		vi.mocked(fetch).mockResolvedValueOnce(mockResponse({ entry: { id: 1, rpe: 7 } }));

		await expect(rateEntry(1, 7)).resolves.toEqual({ status: 'stored', rpe: 7 });
	});

	// The bug this exists for: a 2xx whose entry is still unrated.
	it('calls out an accepted write that stored nothing', async () => {
		vi.mocked(fetch).mockResolvedValueOnce(mockResponse({ id: 1, rpe: null }));

		await expect(rateEntry(1, 7)).resolves.toEqual({ status: 'dropped' });
	});

	it('reports what it cannot check', async () => {
		vi.mocked(fetch).mockResolvedValueOnce(mockResponse({ success: true }));

		await expect(rateEntry(1, 7)).resolves.toEqual({ status: 'unconfirmed' });
	});

	it('treats an empty answer as unconfirmed', async () => {
		vi.mocked(fetch).mockResolvedValueOnce(mockResponse(null));

		await expect(rateEntry(1, 7)).resolves.toEqual({ status: 'unconfirmed' });
	});

	it('throws with the message the API gave', async () => {
		vi.mocked(fetch).mockResolvedValueOnce(
			mockResponse({ message: 'rpe: must be between 1 and 10, got 11' }, { status: 400 })
		);

		await expect(rateEntry(1, 11)).rejects.toThrow('rpe: must be between 1 and 10, got 11');
	});

	it('falls back to the status when the failure says nothing', async () => {
		vi.mocked(fetch).mockResolvedValueOnce(mockResponse('', { status: 500 }));

		await expect(rateEntry(1, 7)).rejects.toThrow('Failed to save feedback (500)');
	});
});
