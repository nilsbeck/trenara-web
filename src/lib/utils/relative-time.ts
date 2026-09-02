const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const MONTH_MS = 30 * DAY_MS;
const YEAR_MS = 365 * DAY_MS;

/** `3 hours`, `6 days`, `2 months` — the phrase without a direction, for a caller composing its own sentence. */
export function relativeDuration(then: Date, now: Date = new Date()): string {
	const elapsed = Math.max(0, now.getTime() - then.getTime());

	if (elapsed < MINUTE_MS) return 'less than a minute';
	if (elapsed < HOUR_MS) return plural(Math.floor(elapsed / MINUTE_MS), 'minute');
	if (elapsed < DAY_MS) return plural(Math.floor(elapsed / HOUR_MS), 'hour');
	if (elapsed < MONTH_MS) return plural(Math.floor(elapsed / DAY_MS), 'day');
	if (elapsed < YEAR_MS) return plural(Math.floor(elapsed / MONTH_MS), 'month');
	return plural(Math.floor(elapsed / YEAR_MS), 'year');
}

function plural(count: number, unit: string): string {
	return `${count} ${unit}${count === 1 ? '' : 's'}`;
}

/**
 * `Updated 3 hours ago` — the shared page's honesty about its own snapshot.
 *
 * Coarse on purpose: the snapshot is refreshed on the owner's own page loads
 * and nothing finer than "a few hours" is a claim this app can stand behind,
 * so the phrase never resolves to seconds. `then` in the future (a clock
 * skew, not a real state) reads as "just now" rather than a negative age.
 */
export function relativeTimeAgo(then: Date, now: Date = new Date()): string {
	if (then.getTime() >= now.getTime()) return 'just now';
	return `${relativeDuration(then, now)} ago`;
}
