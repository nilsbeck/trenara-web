/**
 * Staying inside Trenara's 60-requests-per-minute budget.
 *
 * The limit is a **fixed** window, not a rolling one: `x-ratelimit-reset` is a
 * Unix second that matches `retry-after`, so the budget refills all at once
 * rather than draining request by request (see `docs/backend-api.md`). Two
 * things follow, and the first is counter-intuitive enough to be worth stating.
 *
 * **Spacing requests out does nothing.** A fixed window counts sixty requests
 * however they are spread, so a delay between them buys no headroom at all —
 * it only makes the same refusal arrive later. What works is sending fewer, or
 * waiting for the window to turn over.
 *
 * So this does not pace. It reads the budget off every response — the headers
 * are on all of them, not just refusals — and stops dead when the budget is
 * nearly spent, until the window resets. An export of a whole year is 53
 * weeks and never comes near the limit; an export of five is 260 and would
 * spend four windows, which is exactly the case this exists for.
 */

export interface RateLimit {
	/** Requests allowed per window. */
	limit: number;
	/** Requests left in the current window. */
	remaining: number;
	/** Unix **second** the window turns over. */
	reset: number;
}

/** Just enough of `Headers` to read one, so tests need no fetch. */
export interface HeaderBag {
	get(name: string): string | null;
}

/**
 * How much of the budget to leave unspent.
 *
 * Not zero, for two reasons: the app shares this budget, so a runner with the
 * calendar open in a tab is spending it at the same time; and the count this
 * reads is one response behind, since a request in flight has not been
 * answered yet. Two is enough for both without costing a window.
 */
export const RESERVE = 2;

/** A whole, non-negative number from a header, or null if it is not one. */
function count(raw: string | null): number | null {
	if (raw === null) return null;
	const value = Number(raw.trim());
	return Number.isInteger(value) && value >= 0 ? value : null;
}

/**
 * The budget a response reports, or null when it does not report one.
 *
 * Null rather than a guess: a proxy that strips the headers, or an endpoint
 * that never sent them, must not be read as "zero requests left" — that would
 * stall the export for a minute on every request.
 */
export function readRateLimit(headers: HeaderBag): RateLimit | null {
	const limit = count(headers.get('x-ratelimit-limit'));
	const remaining = count(headers.get('x-ratelimit-remaining'));
	const reset = count(headers.get('x-ratelimit-reset'));
	if (limit === null || remaining === null || reset === null) return null;
	return { limit, remaining, reset };
}

/**
 * How long to wait before spending the next request, in milliseconds.
 *
 * Zero whenever there is budget left, which is the overwhelmingly common
 * answer — nothing is paced while the window has room. Once the reserve is
 * reached it is the whole remainder of the window, because a fixed window
 * gives back nothing until it turns over: waiting half of it would just spend
 * the wait and still be refused.
 */
export function pauseBefore(
	limit: RateLimit | null,
	now: number,
	reserve: number = RESERVE
): number {
	if (limit === null || limit.remaining > reserve) return 0;
	// A reset already in the past means the window has turned over and the
	// count in hand is stale — the next response will carry a fresh one.
	return Math.max(0, limit.reset * 1000 - now);
}

/**
 * How long a refusal says to wait, in milliseconds.
 *
 * `retry-after` first, since that is the header that exists to answer this;
 * `x-ratelimit-reset` as the fallback, because the two agree on this API and
 * either alone is enough. A refusal carrying neither gets one window, which is
 * the only safe assumption available.
 */
export function retryAfterMs(headers: HeaderBag, now: number, fallbackMs = 60_000): number {
	const retryAfter = count(headers.get('retry-after'));
	if (retryAfter !== null) return retryAfter * 1000;

	const reset = count(headers.get('x-ratelimit-reset'));
	if (reset !== null) return Math.max(0, reset * 1000 - now);

	return fallbackMs;
}

/**
 * Whether a run can possibly fit in one window, for the warning up front.
 *
 * Worth saying before the first request rather than discovering it forty weeks
 * in: a long export is not an error, but it is going to pause, and a run that
 * looks hung is a run somebody kills.
 */
export function windowsNeeded(requests: number, limit = 60, reserve: number = RESERVE): number {
	const perWindow = Math.max(1, limit - reserve);
	return Math.ceil(requests / perWindow);
}
