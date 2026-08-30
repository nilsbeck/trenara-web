import type { Cookies } from '@sveltejs/kit';
import { TokenType } from '$lib/server/auth/types';
import {
	recordRequest,
	rateLimitDiagnostic,
	type RateLimitDiagnostic
} from '$lib/server/trenara/rate-limit';

const BASE_URL = 'https://backend-prod.trenara.com';

/**
 * How long one attempt waits for Trenara before giving up.
 *
 * There was no default at all, which meant a connection Trenara accepted and
 * then never answered held the request open until the platform killed the
 * whole function — no status, no error page, just a dead tab. A cap well
 * inside the function's own limit turns that into a 504 the app can draw.
 */
export const DEFAULT_TIMEOUT_MS = 6000;

/**
 * How long a call may spend in total, retries and backoff included.
 *
 * Retrying is only worth anything if the answer still arrives before the
 * platform stops listening: a serverless function that is killed mid-retry
 * costs the user the error page as well as the data. So attempts share one
 * wall-clock budget rather than each getting a fresh timeout.
 */
export const DEFAULT_BUDGET_MS = 9000;

/** No point starting another attempt with less time left than this. */
const MIN_ATTEMPT_MS = 750;

/** First backoff step; each retry doubles it up to {@link MAX_BACKOFF_MS}. */
const BASE_BACKOFF_MS = 250;

const MAX_BACKOFF_MS = 2000;

export interface RequestOptions {
	headers?: Record<string, string>;
	cookies?: Cookies;
	/** Per-attempt cap. Defaults to {@link DEFAULT_TIMEOUT_MS}; 0 disables it. */
	timeout?: number;
	/**
	 * Total wall clock for the call, retries included. Defaults to
	 * {@link DEFAULT_BUDGET_MS}; 0 disables it.
	 */
	budget?: number;
	/**
	 * Extra attempts after the first. Defaults to one for reads and none for
	 * writes — see {@link defaultRetries}.
	 */
	retries?: number;
	params?: Record<string, string | number | boolean>;
	/**
	 * The caller's own abort, if it has one. Honoured alongside the timeout and
	 * reported as an abort rather than as a timeout, since the two mean
	 * different things to whoever asked.
	 */
	signal?: AbortSignal | null;
}

export class HttpError extends Error {
	constructor(
		message: string,
		public status: number,
		public data?: unknown
	) {
		super(message);
		this.name = 'HttpError';
	}
}

export class AuthenticationError extends HttpError {
	constructor(message: string, data?: unknown) {
		super(message, 401, data);
		this.name = 'AuthenticationError';
	}
}

/**
 * Trenara asking this app to slow down.
 *
 * Carries the snapshot of what was being sent in the run-up, because a 429 on
 * its own cannot be acted on: the fix for one endpoint being hammered and for
 * a page opening a dozen requests at once are not the same fix, and the status
 * looks identical either way.
 */
export class RateLimitError extends HttpError {
	constructor(
		message: string,
		public diagnostic: RateLimitDiagnostic,
		data?: unknown
	) {
		super(message, 429, data);
		this.name = 'RateLimitError';
	}
}

export class NetworkError extends Error {
	constructor(
		message: string,
		public originalError?: Error
	) {
		super(message);
		this.name = 'NetworkError';
	}
}

export class TimeoutError extends Error {
	constructor(message = 'Request timeout') {
		super(message);
		this.name = 'TimeoutError';
	}
}

/**
 * An answer that arrived but was not the kind of thing it said it was.
 *
 * Distinct from `HttpError`, which is Trenara refusing in its own words. This
 * is a 200 whose body is not the JSON its `content-type` promised — a proxy's
 * HTML error page, a truncated payload, a maintenance splash. Left as the raw
 * `SyntaxError` it used to be, it reached the runner as "Something went wrong
 * on our side", which points at the wrong server.
 */
export class MalformedResponseError extends Error {
	constructor(
		message: string,
		public override cause?: unknown
	) {
		super(message);
		this.name = 'MalformedResponseError';
	}
}

/** True for the failures that say nothing about whether the request landed. */
export function isTransportError(error: unknown): error is NetworkError | TimeoutError {
	return error instanceof NetworkError || error instanceof TimeoutError;
}

/**
 * A failed `fetch` rejects with a `TypeError`, which is also what a programming
 * mistake in the call throws. The distinction matters — one is worth retrying
 * and reporting as "Trenara is unreachable", the other is a bug — so the cause
 * chain is inspected as well as the message: undici puts the real reason
 * (`ECONNREFUSED`, `ENOTFOUND`, a socket hang-up) there.
 */
function asNetworkError(error: unknown): NetworkError | null {
	if (!(error instanceof TypeError)) return null;

	const cause = (error as { cause?: unknown }).cause;
	const looksLikeTransport =
		error.message.includes('fetch') ||
		error.message.includes('network') ||
		error.message.includes('Network') ||
		cause !== undefined;

	return looksLikeTransport ? new NetworkError('Network request failed', error) : null;
}

/** Reads may be repeated blind; writes may not. */
function isSafeMethod(method: string): boolean {
	return method === 'GET' || method === 'HEAD';
}

/**
 * How many extra attempts a call gets when the caller does not say.
 *
 * A read costs nothing to repeat, and a single retry covers the dropped
 * connection that a mobile network produces several times an hour. A write is
 * left alone: `POST /api/entries` files an activity, and a retry that the
 * runner cannot see is worse than an error they can.
 */
function defaultRetries(method: string): number {
	return isSafeMethod(method) ? 1 : 0;
}

/**
 * Whether another attempt could plausibly do better.
 *
 * Two of these are less obvious than they look:
 *
 * A **timeout** says the request was sent and no answer came back, which for a
 * write leaves the change possibly applied — repeating it could double it, and
 * for token refresh it would present an already rotated token and end the
 * session. So only reads are retried on a timeout, whatever the caller asked.
 *
 * A **5xx** is retried only when the caller asked for retries by name. It means
 * the server was reached and is struggling, and the dashboard alone opens five
 * or six calls at once: retrying all of them by default would answer an
 * overloaded Trenara by doubling what it is being asked to carry. A dropped
 * connection is the opposite case — nothing arrived, so nothing is added by
 * asking again — and that one is retried by default.
 */
function isRetryable(error: unknown, method: string, retriesRequested: boolean): boolean {
	if (error instanceof AuthenticationError) return false;
	if (error instanceof NetworkError) return true;
	if (error instanceof TimeoutError) return isSafeMethod(method);
	if (error instanceof HttpError) return retriesRequested && error.status >= 500;
	return false;
}

/** Exponential backoff, capped, with jitter so parallel calls do not resynchronise. */
function backoffFor(attempt: number): number {
	const step = Math.min(BASE_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS);
	return step / 2 + Math.random() * (step / 2);
}

class FetchClient {
	private static instance: FetchClient;

	private constructor() {}

	static getInstance(): FetchClient {
		if (!FetchClient.instance) {
			FetchClient.instance = new FetchClient();
		}
		return FetchClient.instance;
	}

	private buildUrl(url: string, params?: Record<string, string | number | boolean>): string {
		const fullUrl = url.startsWith('http') ? url : `${BASE_URL}${url}`;
		if (!params || Object.keys(params).length === 0) return fullUrl;

		const urlObj = new URL(fullUrl);
		for (const [key, value] of Object.entries(params)) {
			urlObj.searchParams.append(key, String(value));
		}
		return urlObj.toString();
	}

	private buildCookieHeader(cookies: Cookies): string {
		const cookieNames = [
			TokenType.AccessToken,
			TokenType.RefreshToken,
			`${TokenType.AccessToken}_expiration`,
			`${TokenType.RefreshToken}_expiration`,
			'trenara_session'
		];

		return cookieNames
			.map((name) => {
				const value = cookies.get(name);
				return value ? `${name}=${value}` : null;
			})
			.filter(Boolean)
			.join('; ');
	}

	/**
	 * Read a body that said it was JSON, insisting that it is.
	 *
	 * A truncated body rejects with a `TypeError` carrying a cause, which is
	 * transport trouble and worth another attempt; anything else is a body that
	 * is simply not JSON, which retrying cannot fix.
	 */
	private async readJson<T>(response: Response): Promise<T> {
		try {
			return (await response.json()) as T;
		} catch (error) {
			const transport = asNetworkError(error);
			if (transport) throw transport;

			throw new MalformedResponseError(
				`Expected JSON from ${response.url || 'Trenara'} but the body could not be parsed`,
				error
			);
		}
	}

	/**
	 * One attempt: send it, wait no longer than `timeout`, and translate the
	 * answer into either a value or one of this module's error types.
	 *
	 * The timer is cleared in a `finally` rather than after the `await`. That
	 * was a leak worth its own line: when `fetch` itself rejected, the timer
	 * survived the request and fired later against a controller nobody was
	 * listening to — on a warm serverless instance, once per failed call.
	 */
	private async attempt<T>(
		url: string,
		init: RequestInit,
		timeout: number,
		callerSignal: AbortSignal | null | undefined
	): Promise<T> {
		const controller = new AbortController();
		let timedOut = false;

		const timeoutId = timeout
			? setTimeout(() => {
					timedOut = true;
					controller.abort();
				}, timeout)
			: null;

		// A caller's own abort has to reach the fetch too, and must not be
		// reported as a timeout: the two mean different things to whoever asked.
		const onCallerAbort = () => controller.abort();
		callerSignal?.addEventListener('abort', onCallerAbort, { once: true });
		if (callerSignal?.aborted) controller.abort();

		const method = (init.method ?? 'GET').toUpperCase();

		// Recorded before the answer, so the trail holds what was sent whatever
		// comes back — including the requests that were still in flight when a
		// sibling was refused.
		recordRequest(method, url);

		try {
			const response = await fetch(url, { ...init, signal: controller.signal });

			if (response.status === 401) {
				throw new AuthenticationError('Unauthorized');
			}

			if (response.status === 429) {
				const diagnostic = rateLimitDiagnostic(method, url, response.headers);

				// One line, prefixed and parseable, so it can be found in the
				// platform's log with a plain text search and pasted whole.
				console.error(`[rate-limit] ${JSON.stringify(diagnostic)}`);

				throw new RateLimitError(
					'Trenara is rate limiting this app',
					diagnostic,
					await response.json().catch(() => null)
				);
			}

			if (response.ok) {
				if (response.status === 204) return undefined as T;
				const contentType = response.headers.get('content-type');
				if (contentType?.includes('application/json')) {
					return (await this.readJson<T>(response)) as T;
				}
				return (await response.text()) as unknown as T;
			}

			let errorData: unknown = null;
			try {
				errorData = await response.json();
			} catch {
				// ignore parse errors
			}

			throw new HttpError(
				(errorData as Record<string, string>)?.message ?? response.statusText,
				response.status,
				errorData
			);
		} catch (error) {
			if (error instanceof Error && error.name === 'AbortError') {
				if (timedOut) throw new TimeoutError(`Request timeout after ${timeout}ms`);
				throw error;
			}

			// Normalise a failed fetch here, so the retry check below sees a
			// NetworkError rather than a bare TypeError.
			throw asNetworkError(error) ?? error;
		} finally {
			if (timeoutId) clearTimeout(timeoutId);
			callerSignal?.removeEventListener('abort', onCallerAbort);
		}
	}

	async request<T>(
		url: string,
		options: RequestOptions & Omit<RequestInit, 'headers'> = {}
	): Promise<T> {
		const {
			headers: extraHeaders,
			cookies,
			timeout: timeoutOption,
			budget: budgetOption,
			retries,
			params,
			signal,
			...init
		} = options;

		const fullUrl = this.buildUrl(url, params);
		const method = (init.method ?? 'GET').toUpperCase();
		const maxRetries = retries ?? defaultRetries(method);
		const timeout = timeoutOption ?? DEFAULT_TIMEOUT_MS;
		const budget = budgetOption ?? DEFAULT_BUDGET_MS;
		const deadline = budget ? Date.now() + budget : Infinity;

		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
			...(extraHeaders ?? {})
		};

		// Forward cookies on server-side
		if (cookies) {
			const cookieHeader = this.buildCookieHeader(cookies);
			if (cookieHeader) {
				headers['Cookie'] = cookieHeader;
			}
		}

		const fetchOptions: RequestInit = { ...init, headers };

		for (let attempt = 0; ; attempt++) {
			// Never wait past the budget, even on the first attempt: a call that
			// answers after the function has been killed answers nobody. The floor
			// of 1ms matters — a 0 here would read as "no timeout at all" and turn
			// a spent budget into an unbounded wait, the exact failure this is for.
			const remaining = deadline - Date.now();
			const attemptTimeout = Number.isFinite(remaining)
				? Math.max(timeout ? Math.min(timeout, remaining) : remaining, 1)
				: timeout;

			try {
				return await this.attempt<T>(fullUrl, fetchOptions, attemptTimeout, signal);
			} catch (error) {
				if (attempt >= maxRetries || !isRetryable(error, method, retries !== undefined)) {
					throw error;
				}

				// Only back off and try again if there is time for the attempt to
				// finish; otherwise report the failure we already have, in time for
				// the caller to do something with it.
				const backoff = backoffFor(attempt);
				if (deadline - Date.now() - backoff < MIN_ATTEMPT_MS) throw error;

				await new Promise((r) => setTimeout(r, backoff));
			}
		}
	}

	async get<T>(url: string, options: RequestOptions = {}): Promise<T> {
		return this.request<T>(url, { ...options, method: 'GET' });
	}

	async post<T>(url: string, data?: unknown, options: RequestOptions = {}): Promise<T> {
		return this.request<T>(url, {
			...options,
			method: 'POST',
			body: data !== undefined ? JSON.stringify(data) : undefined
		});
	}

	async put<T>(url: string, data?: unknown, options: RequestOptions = {}): Promise<T> {
		return this.request<T>(url, {
			...options,
			method: 'PUT',
			body: data !== undefined ? JSON.stringify(data) : undefined
		});
	}

	async delete<T>(url: string, options: RequestOptions = {}): Promise<T> {
		return this.request<T>(url, { ...options, method: 'DELETE' });
	}
}

export const fetchClient = FetchClient.getInstance();
