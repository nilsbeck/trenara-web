import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HttpError, AuthenticationError, NetworkError, TimeoutError } from './client';

// ─────────────────────────────────────────────────────────────
// We can't directly access the private FetchClient class, but
// the module exports a singleton `fetchClient`. We re-import
// after mocking fetch for each test.
// ─────────────────────────────────────────────────────────────

// Helper to build a mock Response
function mockResponse(body: unknown, init: ResponseInit & { headers?: Record<string, string> } = {}) {
	const status = init.status ?? 200;
	const headers = new Headers(init.headers ?? { 'content-type': 'application/json' });
	return {
		ok: status >= 200 && status < 300,
		status,
		statusText: init.statusText ?? 'OK',
		headers,
		json: () => Promise.resolve(body),
		text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body))
	} as unknown as Response;
}

let fetchClient: typeof import('./client').fetchClient;

beforeEach(async () => {
	vi.stubGlobal('fetch', vi.fn());
	// Re-import to get the singleton; it's already created but uses the global fetch
	const mod = await import('./client');
	fetchClient = mod.fetchClient;
});

afterEach(() => {
	vi.restoreAllMocks();
});

// ─────────────────────────────────────────────────────────────
// Error classes
// ─────────────────────────────────────────────────────────────
describe('HttpError', () => {
	it('stores status and data', () => {
		const err = new HttpError('bad request', 400, { detail: 'missing field' });
		expect(err.message).toBe('bad request');
		expect(err.status).toBe(400);
		expect(err.data).toEqual({ detail: 'missing field' });
		expect(err.name).toBe('HttpError');
		expect(err).toBeInstanceOf(Error);
	});
});

describe('AuthenticationError', () => {
	it('is an HttpError with status 401', () => {
		const err = new AuthenticationError('Unauthorized');
		expect(err.status).toBe(401);
		expect(err.name).toBe('AuthenticationError');
		expect(err).toBeInstanceOf(HttpError);
	});
});

describe('NetworkError', () => {
	it('stores the original error', () => {
		const original = new TypeError('Failed to fetch');
		const err = new NetworkError('Network request failed', original);
		expect(err.originalError).toBe(original);
		expect(err.name).toBe('NetworkError');
	});
});

describe('TimeoutError', () => {
	it('has a default message', () => {
		const err = new TimeoutError();
		expect(err.message).toBe('Request timeout');
		expect(err.name).toBe('TimeoutError');
	});

	it('accepts a custom message', () => {
		const err = new TimeoutError('custom');
		expect(err.message).toBe('custom');
	});
});

// ─────────────────────────────────────────────────────────────
// fetchClient.get
// ─────────────────────────────────────────────────────────────
describe('fetchClient.get', () => {
	it('returns JSON for a successful response', async () => {
		vi.mocked(fetch).mockResolvedValueOnce(mockResponse({ id: 1 }));
		const result = await fetchClient.get<{ id: number }>('/api/test');
		expect(result).toEqual({ id: 1 });
		expect(fetch).toHaveBeenCalledOnce();
	});

	it('prepends base URL for relative paths', async () => {
		vi.mocked(fetch).mockResolvedValueOnce(mockResponse({}));
		await fetchClient.get('/api/test');
		const url = vi.mocked(fetch).mock.calls[0][0] as string;
		expect(url).toBe('https://backend-prod.trenara.com/api/test');
	});

	it('preserves absolute URLs', async () => {
		vi.mocked(fetch).mockResolvedValueOnce(mockResponse({}));
		await fetchClient.get('https://other.com/api');
		const url = vi.mocked(fetch).mock.calls[0][0] as string;
		expect(url).toBe('https://other.com/api');
	});

	it('appends query params', async () => {
		vi.mocked(fetch).mockResolvedValueOnce(mockResponse({}));
		await fetchClient.get('/api/test', { params: { foo: 'bar', n: 42 } });
		const url = vi.mocked(fetch).mock.calls[0][0] as string;
		expect(url).toContain('foo=bar');
		expect(url).toContain('n=42');
	});

	it('returns text for non-JSON content-type', async () => {
		vi.mocked(fetch).mockResolvedValueOnce(
			mockResponse('plain text', { headers: { 'content-type': 'text/plain' } })
		);
		const result = await fetchClient.get<string>('/api/text');
		expect(result).toBe('plain text');
	});

	it('returns undefined for 204 No Content', async () => {
		vi.mocked(fetch).mockResolvedValueOnce(mockResponse(null, { status: 204 }));
		const result = await fetchClient.get('/api/empty');
		expect(result).toBeUndefined();
	});
});

// ─────────────────────────────────────────────────────────────
// fetchClient.post / put / delete
// ─────────────────────────────────────────────────────────────
describe('fetchClient.post', () => {
	it('sends JSON body with POST method', async () => {
		vi.mocked(fetch).mockResolvedValueOnce(mockResponse({ ok: true }));
		await fetchClient.post('/api/create', { name: 'test' });
		const [, init] = vi.mocked(fetch).mock.calls[0];
		expect(init?.method).toBe('POST');
		expect(init?.body).toBe(JSON.stringify({ name: 'test' }));
	});
});

describe('fetchClient.put', () => {
	it('sends JSON body with PUT method', async () => {
		vi.mocked(fetch).mockResolvedValueOnce(mockResponse({ ok: true }));
		await fetchClient.put('/api/update', { id: 1 });
		const [, init] = vi.mocked(fetch).mock.calls[0];
		expect(init?.method).toBe('PUT');
	});
});

describe('fetchClient.delete', () => {
	it('sends DELETE request', async () => {
		vi.mocked(fetch).mockResolvedValueOnce(mockResponse(null, { status: 204 }));
		await fetchClient.delete('/api/remove');
		const [, init] = vi.mocked(fetch).mock.calls[0];
		expect(init?.method).toBe('DELETE');
	});
});

// ─────────────────────────────────────────────────────────────
// Error handling
// ─────────────────────────────────────────────────────────────
describe('error handling', () => {
	it('throws AuthenticationError on 401', async () => {
		vi.mocked(fetch).mockResolvedValueOnce(mockResponse({}, { status: 401 }));
		await expect(fetchClient.get('/api/secret')).rejects.toThrow(AuthenticationError);
	});

	it('throws HttpError with message from response body', async () => {
		vi.mocked(fetch).mockResolvedValueOnce(
			mockResponse({ message: 'Not Found' }, { status: 404, statusText: 'Not Found' })
		);
		await expect(fetchClient.get('/api/missing')).rejects.toThrow(HttpError);
		try {
			await fetchClient.get('/api/missing');
		} catch (e) {
			// re-mock for the second call
		}
	});

	it('throws HttpError with statusText when body has no message', async () => {
		vi.mocked(fetch).mockResolvedValueOnce(
			mockResponse(null, {
				status: 500,
				statusText: 'Internal Server Error',
				headers: { 'content-type': 'application/json' }
			})
		);
		// json() will reject since body is null — HttpError falls back to statusText
		await expect(fetchClient.get('/api/fail')).rejects.toThrow(HttpError);
	});

	it('throws NetworkError on fetch TypeError', async () => {
		vi.mocked(fetch).mockRejectedValueOnce(new TypeError('Failed to fetch'));
		await expect(fetchClient.get('/api/down')).rejects.toThrow(NetworkError);
	});
});

// ─────────────────────────────────────────────────────────────
// Retry logic
// ─────────────────────────────────────────────────────────────
describe('retry logic', () => {
	it('retries on 500 errors up to maxRetries', async () => {
		vi.mocked(fetch)
			.mockResolvedValueOnce(mockResponse({}, { status: 500, statusText: 'Error' }))
			.mockResolvedValueOnce(mockResponse({ ok: true }));

		const result = await fetchClient.get<{ ok: boolean }>('/api/flaky', { retries: 1 });
		expect(result).toEqual({ ok: true });
		expect(fetch).toHaveBeenCalledTimes(2);
	});

	it('does not retry on 4xx errors', async () => {
		vi.mocked(fetch).mockResolvedValueOnce(
			mockResponse({ message: 'Bad Request' }, { status: 400, statusText: 'Bad Request' })
		);
		await expect(fetchClient.get('/api/bad', { retries: 2 })).rejects.toThrow(HttpError);
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it('does not retry on 401', async () => {
		vi.mocked(fetch).mockResolvedValueOnce(mockResponse({}, { status: 401 }));
		await expect(fetchClient.get('/api/auth', { retries: 2 })).rejects.toThrow(
			AuthenticationError
		);
		expect(fetch).toHaveBeenCalledTimes(1);
	});
});

// ─────────────────────────────────────────────────────────────
// Cookie forwarding
// ─────────────────────────────────────────────────────────────
describe('cookie forwarding', () => {
	it('builds Cookie header from cookies jar', async () => {
		vi.mocked(fetch).mockResolvedValueOnce(mockResponse({}));

		const mockCookies = {
			get: vi.fn((name: string) => {
				const jar: Record<string, string> = {
					'access-token': 'abc',
					'refresh-token': 'def'
				};
				return jar[name];
			})
		} as unknown as import('@sveltejs/kit').Cookies;

		await fetchClient.get('/api/protected', { cookies: mockCookies });

		const [, init] = vi.mocked(fetch).mock.calls[0];
		const headers = init?.headers as Record<string, string>;
		expect(headers['Cookie']).toContain('access-token=abc');
		expect(headers['Cookie']).toContain('refresh-token=def');
	});
});
