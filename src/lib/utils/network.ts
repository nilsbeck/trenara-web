/**
 * Turning failed browser requests into something a runner can read.
 *
 * Every call site in the app had the same line — `e instanceof Error ?
 * e.message : 'Something went wrong'` — which is right up until the failure is
 * the network itself. Then `e.message` is whatever the browser calls a dead
 * connection: "Failed to fetch" in Chrome, "Load failed" in Safari, "NetworkError
 * when attempting to fetch resource." in Firefox. Three browsers, three
 * sentences, none of them addressed to the person holding the phone — and all
 * three shown to them mid-run, which is exactly when this app is used on a
 * signal that comes and goes.
 */

export const OFFLINE_MESSAGE = 'You appear to be offline. Check your connection and try again.';

export const UNREACHABLE_MESSAGE = 'Could not reach the server. Please try again.';

export const TIMEOUT_MESSAGE = 'The server took too long to answer. Please try again.';

export const EXPIRED_MESSAGE = 'Your session has expired. Please sign in again.';

/**
 * Worded as a pause rather than a fault, because that is what it is: the app
 * asked for too much at once, nothing is broken, and waiting fixes it.
 */
export const RATE_LIMITED_MESSAGE = 'Too many requests just now — give it a moment and try again.';

/**
 * Whether the browser believes there is no connection at all.
 *
 * `navigator.onLine` only ever proves the negative — true means an interface is
 * up, not that anything is reachable — so it is read to sharpen a failure that
 * has already happened, never to decide whether to try.
 */
export function isOffline(): boolean {
	return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/**
 * Whether a thrown value is `fetch` reporting that it never got an answer.
 *
 * `fetch` rejects with a `TypeError` for a dropped connection, a DNS failure, a
 * refused connection and a CORS refusal alike, and with the same `TypeError`
 * for a malformed call — so the message is checked rather than the type alone.
 */
export function isConnectionFailure(e: unknown): boolean {
	if (!(e instanceof TypeError)) return false;

	const message = e.message.toLowerCase();
	return (
		message.includes('fetch') ||
		message.includes('network') ||
		message.includes('load failed') ||
		message.includes('connection')
	);
}

/** Whether a request was called off rather than failed — a stale one, usually. */
export function isAbort(e: unknown): boolean {
	return e instanceof DOMException && e.name === 'AbortError';
}

/**
 * The sentence to show for a failed request.
 *
 * `fallback` is what to say when the failure was not the network: pass what the
 * user was trying to do ("Could not save the change."), because at that point
 * the useful half of the message is which action did not happen.
 */
export function describeError(e: unknown, fallback: string): string {
	if (isConnectionFailure(e)) {
		return isOffline() ? OFFLINE_MESSAGE : UNREACHABLE_MESSAGE;
	}
	if (e instanceof Error && e.message) return e.message;
	return fallback;
}

/**
 * Whether a status is this app saying it could not reach Trenara.
 *
 * `passthrough` on the server answers a dead connection with 502 and a timeout
 * with 504, so a caller can tell those apart from a refusal without parsing the
 * message that came with them.
 */
export function isUnreachableStatus(status: number): boolean {
	return status === 502 || status === 503 || status === 504 || status === 408;
}

/**
 * The message a failed response carried, if it carried one.
 *
 * Everything under `/api/v1` fails through SvelteKit's `error`, so the body is
 * `{ message }` — worded for this exact case, and for a rejected change worded
 * by Trenara itself, which says more than any status could. Consumes the body,
 * so callers that still want it should read it themselves.
 */
export async function responseMessage(res: Response): Promise<string | null> {
	const body = (await res.json().catch(() => null)) as { message?: unknown } | null;
	const message = typeof body?.message === 'string' ? body.message.trim() : '';
	return message || null;
}

/** The sentence to show for a request that was answered, but not with success. */
export async function describeResponse(res: Response, fallback: string): Promise<string> {
	return (await responseMessage(res)) ?? statusMessage(res.status, fallback);
}

/** What a status alone is worth saying, when the body said nothing. */
export function statusMessage(status: number, fallback: string): string {
	if (status === 502 || status === 503) return UNREACHABLE_MESSAGE;
	if (status === 504 || status === 408) return TIMEOUT_MESSAGE;
	if (status === 401) return EXPIRED_MESSAGE;
	if (status === 429) return RATE_LIMITED_MESSAGE;
	return `${fallback} (${status})`;
}
