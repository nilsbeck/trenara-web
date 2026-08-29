import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
	HttpError,
	AuthenticationError,
	MalformedResponseError,
	RateLimitError,
	NetworkError,
	TimeoutError
} from './client';

// ─────────────────────────────────────────────────────────────
// We can't directly access the private FetchClient class, but
// the module exports a singleton `fetchClient`. We re-import
// after mocking fetch for each test.
// ─────────────────────────────────────────────────────────────

// Helper to build a mock Response
function mockResponse(
	body: unknown,
	init: ResponseInit & { headers?: Record<string, string> } = {}
) {
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
		} catch {
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
		// Every attempt fails, the default read retry included.
		vi.mocked(fetch).mockRejectedValue(new TypeError('Failed to fetch'));
		await expect(fetchClient.get('/api/down')).rejects.toThrow(NetworkError);
	});

	// undici reports the real reason as a cause and leaves the message generic,
	// so a `TypeError` with a cause is transport trouble even when it says
	// nothing about fetching.
	it('treats a TypeError carrying a cause as a network failure', async () => {
		const failure = new TypeError('terminated');
		(failure as Error & { cause?: unknown }).cause = new Error('ECONNRESET');
		vi.mocked(fetch).mockRejectedValue(failure);

		await expect(fetchClient.get('/api/down')).rejects.toThrow(NetworkError);
	});

	// A plain TypeError with no cause is a mistake in the calling code, and
	// dressing it up as a network failure would send someone looking at the
	// wrong server entirely.
	it('lets a programming TypeError through unchanged', async () => {
		vi.mocked(fetch).mockRejectedValue(new TypeError('x is not a function'));

		await expect(fetchClient.get('/api/oops')).rejects.toThrow(TypeError);
		await expect(fetchClient.get('/api/oops')).rejects.not.toThrow(NetworkError);
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
		await expect(fetchClient.get('/api/auth', { retries: 2 })).rejects.toThrow(AuthenticationError);
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	// A dropped connection is the failure a phone produces several times an
	// hour, and nothing reached Trenara, so asking again costs it nothing.
	it('retries a dropped connection on a read without being asked', async () => {
		vi.mocked(fetch)
			.mockRejectedValueOnce(new TypeError('Failed to fetch'))
			.mockResolvedValueOnce(mockResponse({ ok: true }));

		const result = await fetchClient.get<{ ok: boolean }>('/api/flaky');
		expect(result).toEqual({ ok: true });
		expect(fetch).toHaveBeenCalledTimes(2);
	});

	// `POST /api/entries` files an activity. A retry the runner cannot see is
	// worse than an error they can, so a write is left alone by default.
	it('does not retry a write unless the caller asked', async () => {
		vi.mocked(fetch).mockRejectedValue(new TypeError('Failed to fetch'));

		await expect(fetchClient.post('/api/entries', { distance: 10 })).rejects.toThrow(NetworkError);
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	// Retrying every 5xx would answer an overloaded server by doubling the load
	// on it — five or six calls open at once, on the dashboard alone.
	it('does not retry a 5xx by default', async () => {
		vi.mocked(fetch).mockResolvedValue(
			mockResponse({ message: 'boom' }, { status: 503, statusText: 'Unavailable' })
		);

		await expect(fetchClient.get('/api/busy')).rejects.toThrow(HttpError);
		expect(fetch).toHaveBeenCalledTimes(1);
	});
});

// ─────────────────────────────────────────────────────────────
// Timeouts
// ─────────────────────────────────────────────────────────────
describe('timeouts', () => {
	/** A fetch that never settles until its signal is aborted. */
	function hangingFetch() {
		return vi.fn(
			(_url: string, init?: RequestInit) =>
				new Promise((_resolve, reject) => {
					init?.signal?.addEventListener('abort', () => {
						reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
					});
				})
		);
	}

	it('gives up on a request that never answers', async () => {
		vi.stubGlobal('fetch', hangingFetch());

		await expect(fetchClient.get('/api/silent', { timeout: 20, retries: 0 })).rejects.toThrow(
			TimeoutError
		);
	});

	// The one that used to leak: when `fetch` itself rejected, the abort timer
	// outlived the request and fired later against nobody.
	it('clears its timer when the request fails', async () => {
		vi.useFakeTimers();
		try {
			vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

			await expect(fetchClient.get('/api/down', { retries: 0 })).rejects.toThrow(NetworkError);
			expect(vi.getTimerCount()).toBe(0);
		} finally {
			vi.useRealTimers();
		}
	});

	it('clears its timer when the request succeeds', async () => {
		vi.useFakeTimers();
		try {
			vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse({ ok: true })));

			await fetchClient.get('/api/quick');
			expect(vi.getTimerCount()).toBe(0);
		} finally {
			vi.useRealTimers();
		}
	});

	// A timed-out write may well have landed upstream. Repeating it could apply
	// the change twice, so only reads are retried on a timeout.
	it('retries a timed-out read but not a timed-out write', async () => {
		const reads = hangingFetch();
		vi.stubGlobal('fetch', reads);
		await expect(fetchClient.get('/api/silent', { timeout: 20 })).rejects.toThrow(TimeoutError);
		expect(reads).toHaveBeenCalledTimes(2);

		const writes = hangingFetch();
		vi.stubGlobal('fetch', writes);
		await expect(
			fetchClient.put('/api/silent', { value: 1 }, { timeout: 20, retries: 2 })
		).rejects.toThrow(TimeoutError);
		expect(writes).toHaveBeenCalledTimes(1);
	});

	// An answer that arrives after the platform has killed the function answers
	// nobody, so retries share one budget rather than each getting a timeout.
	it('stops retrying once the budget is spent', async () => {
		const fetchSpy = hangingFetch();
		vi.stubGlobal('fetch', fetchSpy);

		const started = Date.now();
		await expect(
			fetchClient.get('/api/silent', { timeout: 50, retries: 5, budget: 200 })
		).rejects.toThrow(TimeoutError);

		expect(Date.now() - started).toBeLessThan(1000);
		expect(fetchSpy.mock.calls.length).toBeLessThan(6);
	});

	// A caller calling its own request off is not the same event as a timeout,
	// and must not be reported as one.
	it('reports a caller abort as an abort, not a timeout', async () => {
		vi.stubGlobal('fetch', hangingFetch());

		const controller = new AbortController();
		const pending = fetchClient.get('/api/slow', { signal: controller.signal, retries: 0 });
		controller.abort();

		await expect(pending).rejects.toSatisfy((e: Error) => e.name === 'AbortError');
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

describe('the budget floor', () => {
	// `timeout: 0` asks for no per-attempt cap, but the budget is still a cap:
	// dropping both would leave a hung connection waiting for ever, which is
	// the failure the budget exists to prevent.
	it('still gives up on a hung request when the per-attempt timeout is disabled', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(
				(_url: string, init?: RequestInit) =>
					new Promise((_resolve, reject) => {
						init?.signal?.addEventListener('abort', () => {
							reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
						});
					})
			)
		);

		await expect(
			fetchClient.get('/api/silent', { timeout: 0, budget: 100, retries: 0 })
		).rejects.toThrow(TimeoutError);
	});
});

// ─────────────────────────────────────────────────────────────
// A body that is not what it said it was
// ─────────────────────────────────────────────────────────────
describe('a response that claims JSON and is not', () => {
	/** A 200 whose content-type says JSON but whose body will not parse. */
	function notJson() {
		return {
			ok: true,
			status: 200,
			statusText: 'OK',
			url: 'https://backend-prod.trenara.com/api/me',
			headers: new Headers({ 'content-type': 'application/json' }),
			json: () => Promise.reject(new SyntaxError('Unexpected token < in JSON at position 0')),
			text: () => Promise.resolve('<html>maintenance</html>')
		} as unknown as Response;
	}

	// A proxy's HTML error page or a maintenance splash standing in for the
	// API. It used to escape as a bare SyntaxError and be reported as a bug in
	// this app, which points at the wrong server.
	it('is a malformed response, not a bug in this app', async () => {
		vi.mocked(fetch).mockResolvedValue(notJson());

		await expect(fetchClient.get('/api/me')).rejects.toThrow(MalformedResponseError);
	});

	it('names the endpoint that sent it', async () => {
		vi.mocked(fetch).mockResolvedValue(notJson());

		await expect(fetchClient.get('/api/me')).rejects.toThrow(/api\/me/);
	});

	// Retrying cannot turn an HTML page into JSON. A truncated body is the
	// other case entirely — that one is transport trouble, and is retried.
	it('does not retry a body that simply is not JSON', async () => {
		vi.mocked(fetch).mockResolvedValue(notJson());

		await expect(fetchClient.get('/api/me')).rejects.toThrow(MalformedResponseError);
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it('treats a body that died mid-transfer as a network failure instead', async () => {
		const truncated = notJson() as unknown as { json: () => Promise<unknown> };
		const terminated = new TypeError('terminated');
		(terminated as Error & { cause?: unknown }).cause = new Error('aborted');
		truncated.json = () => Promise.reject(terminated);
		vi.mocked(fetch).mockResolvedValue(truncated as unknown as Response);

		await expect(fetchClient.get('/api/me')).rejects.toThrow(NetworkError);
		expect(fetch).toHaveBeenCalledTimes(2);
	});
});

// ─────────────────────────────────────────────────────────────
// Rate limiting
// ─────────────────────────────────────────────────────────────
describe('a 429 from Trenara', () => {
	function limited(headers: Record<string, string> = {}) {
		return mockResponse(
			{ message: 'Too Many Attempts.' },
			{ status: 429, statusText: 'Too Many Requests', headers }
		);
	}

	it('is raised as a rate limit, not as a plain refusal', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.mocked(fetch).mockResolvedValue(limited());

		await expect(fetchClient.get('/api/schedule')).rejects.toBeInstanceOf(RateLimitError);
	});

	// Retrying a refusal for going too fast is the one response guaranteed to
	// make it worse, and the dashboard opens a dozen calls at once.
	it('is never retried, however many retries were asked for', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.mocked(fetch).mockResolvedValue(limited());

		await expect(fetchClient.get('/api/schedule', { retries: 3 })).rejects.toBeInstanceOf(
			RateLimitError
		);
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it('carries what was being sent in the run-up', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.mocked(fetch).mockResolvedValue(limited({ 'retry-after': '30' }));

		try {
			await fetchClient.get('/api/schedule?date=1');
			expect.unreachable('should have been refused');
		} catch (e) {
			const { diagnostic } = e as InstanceType<typeof RateLimitError>;
			expect(diagnostic.path).toBe('/api/schedule');
			expect(diagnostic.retryAfterSeconds).toBe(30);
			// The refused request is itself in the trail.
			expect(diagnostic.windows[0].total).toBeGreaterThanOrEqual(1);
		}
	});

	// The maintainer greps a platform log for this. One line, one prefix, and
	// the whole payload parseable from it.
	it('logs one parseable line for the platform log', async () => {
		const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.mocked(fetch).mockResolvedValue(limited({ 'x-ratelimit-limit': '60' }));

		await expect(fetchClient.get('/api/goal')).rejects.toBeInstanceOf(RateLimitError);

		const line = logged.mock.calls.flat().find((arg) => String(arg).startsWith('[rate-limit] '));
		expect(line).toBeDefined();
		const payload = JSON.parse(String(line).replace('[rate-limit] ', ''));
		expect(payload.path).toBe('/api/goal');
		expect(payload.limitHeaders['x-ratelimit-limit']).toBe('60');
	});
});
