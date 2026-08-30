/**
 * What this app was asking Trenara for when it got told to slow down.
 *
 * A 429 says nothing on its own: the status is the same whether one endpoint
 * is being hammered or a page opened twelve requests at once. The useful part
 * is what went out just before it, which nothing was recording — so this keeps
 * a short trail of every upstream request and turns it into a snapshot when a
 * 429 arrives.
 *
 * Two honest limits on what it can tell you:
 *
 * 1. The trail is per instance and in memory. On Vercel each serverless
 *    instance has its own, a cold one starts empty, and several may be serving
 *    at once — so a count here is a floor on what Trenara actually saw, never
 *    the total. `instance` is in the snapshot so two of them can be told apart.
 * 2. It records what this app sent, not what Trenara counted. If the limit is
 *    per IP, everything behind the same Vercel egress shares it.
 */

/** One upstream request, as sent. */
interface SentRequest {
	at: number;
	method: string;
	path: string;
}

/**
 * How many requests are remembered.
 *
 * A dashboard load is a dozen; a minute of chat polling is twenty. Three
 * hundred covers a busy minute several times over and costs a few KB.
 */
const TRAIL_SIZE = 300;

/**
 * The windows a snapshot reports.
 *
 * Both, because they answer different questions: ten seconds catches the burst
 * a single page load fires, sixty catches sustained polling. A limit tripped by
 * one and not the other points at completely different code.
 */
const WINDOW_SECONDS = [10, 60] as const;

/** Response headers worth keeping — these are what state the actual limit. */
const LIMIT_HEADER_PATTERN = /^(retry-after|x-ratelimit-|ratelimit-|x-rate-limit-)/i;

/** Distinguishes one serverless instance's trail from another's. */
export const INSTANCE_ID = Math.random().toString(36).slice(2, 8);

const trail: SentRequest[] = [];

export interface RateLimitWindow {
	seconds: number;
	total: number;
	byPath: { path: string; count: number }[];
}

export interface RateLimitDiagnostic {
	/** When the 429 came back. */
	at: string;
	/** The request that was refused. */
	method: string;
	path: string;
	/** From `Retry-After`, in seconds, when Trenara sent one. */
	retryAfterSeconds: number | null;
	/** Any rate-limit headers on the response — the limit itself, if it says. */
	limitHeaders: Record<string, string>;
	/** What this instance sent in the run-up, by window. */
	windows: RateLimitWindow[];
	instance: string;
}

/**
 * The path, with ids folded away.
 *
 * `/api/schedule/trainings/127477827` and its neighbour are the same endpoint
 * for counting purposes, and the whole point is the count. The query string is
 * dropped: the schedule's week timestamps would split one endpoint into six
 * rows, which is the opposite of what a grouping is for.
 */
export function normalisePath(url: string): string {
	try {
		return new URL(url).pathname.replace(/\/\d+(?=\/|$)/g, '/:id');
	} catch {
		return url.split('?')[0];
	}
}

/** Note that a request went out. Called for every attempt, retries included. */
export function recordRequest(method: string, url: string, now = Date.now()): void {
	trail.push({ at: now, method: method.toUpperCase(), path: normalisePath(url) });
	if (trail.length > TRAIL_SIZE) trail.splice(0, trail.length - TRAIL_SIZE);
}

/** Only for tests — the trail is process-wide and outlives a single case. */
export function resetTrail(): void {
	trail.length = 0;
}

function windowFor(seconds: number, now: number): RateLimitWindow {
	const since = now - seconds * 1000;
	const counts = new Map<string, number>();
	let total = 0;

	for (const request of trail) {
		if (request.at < since) continue;
		total += 1;
		const key = `${request.method} ${request.path}`;
		counts.set(key, (counts.get(key) ?? 0) + 1);
	}

	return {
		seconds,
		total,
		byPath: [...counts.entries()]
			.map(([path, count]) => ({ path, count }))
			.sort((a, b) => b.count - a.count)
	};
}

/** Everything worth keeping about a `Retry-After`, whichever form it took. */
export function parseRetryAfter(value: string | null, now = Date.now()): number | null {
	if (!value) return null;

	// The header is either a count of seconds or an HTTP date; both are legal
	// and Trenara has not been observed sending either, so both are read.
	const seconds = Number(value.trim());
	if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds);

	const at = Date.parse(value);
	if (Number.isNaN(at)) return null;

	return Math.max(0, Math.round((at - now) / 1000));
}

/** Build the snapshot that goes to the log and onto the error page. */
export function rateLimitDiagnostic(
	method: string,
	url: string,
	headers: Headers,
	now = Date.now()
): RateLimitDiagnostic {
	const limitHeaders: Record<string, string> = {};
	headers.forEach((value, name) => {
		if (LIMIT_HEADER_PATTERN.test(name)) limitHeaders[name.toLowerCase()] = value;
	});

	return {
		at: new Date(now).toISOString(),
		method: method.toUpperCase(),
		path: normalisePath(url),
		retryAfterSeconds: parseRetryAfter(headers.get('retry-after'), now),
		limitHeaders,
		windows: WINDOW_SECONDS.map((seconds) => windowFor(seconds, now)),
		instance: INSTANCE_ID
	};
}
