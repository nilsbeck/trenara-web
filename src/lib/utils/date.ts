export function formatDateString(year: number, month: number, day: number): string {
	return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function getMonthTimestamps(date: Date): Date[] {
	const year = date.getFullYear();
	const month = date.getMonth();
	const firstDayOfMonthDate = new Date(year, month, 1);
	const firstDayOfMonth = firstDayOfMonthDate.getDay();
	const offsetAtStart = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1;
	const daysInMonth = new Date(year, month + 1, 0).getDate();
	const weeksInMonth = Math.ceil((offsetAtStart + daysInMonth) / 7);

	const nextMonday = new Date(firstDayOfMonthDate);
	nextMonday.setDate(nextMonday.getDate() + ((1 + 7 - firstDayOfMonthDate.getDay()) % 7 || 7));

	const timestamps: Date[] = [firstDayOfMonthDate];
	timestamps.push(new Date(nextMonday));
	for (let i = timestamps.length; i < weeksInMonth; i++) {
		nextMonday.setDate(nextMonday.getDate() + 7);
		timestamps.push(new Date(nextMonday));
	}
	return timestamps;
}

/** Local `YYYY-MM-DD` for a Date. Local on purpose: a training day is a local day. */
export function toLocalDateString(date: Date): string {
	return formatDateString(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * An API date field as a Date, or null when it does not name a moment.
 *
 * `new Date(...)` answers an unreadable string with an Invalid Date rather than
 * an error, and an Invalid Date is contagious: it compares false against
 * everything, formats as the words "Invalid Date", and turns every subtraction
 * downstream into a NaN that reaches the screen as `NaN%` or "NaN days".
 */
export function toDate(value: string | null | undefined): Date | null {
	if (typeof value !== 'string' || !value.trim()) return null;

	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * The `YYYY-MM-DD` an API date field names, or null when it names nothing.
 *
 * Every dated row from Trenara — a planned session's `day_long`, a strength
 * session's `day` — is typed `string` because that is what every capture has
 * held, not because the API promises one. The calendar keys its whole index off
 * these, and a `.slice` on a null took the month down over a single row; a null
 * here costs that row its dot and nothing else.
 *
 * A prefix match rather than an exact one: `day_long` arrives as a bare date on
 * some rows and as a full timestamp on others, and both name the same day.
 */
export function dayKeyOf(value: string | null | undefined): string | null {
	if (typeof value !== 'string') return null;
	return /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null;
}

/** `YYYY-MM-DD` back to local midnight. Null on anything that is not that shape. */
export function parseLocalDateString(value: string): Date | null {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
	if (!match) return null;
	const [, year, month, day] = match;
	const date = new Date(Number(year), Number(month) - 1, Number(day));
	// Rejects the likes of 2025-02-31, which Date would roll into March.
	return date.getMonth() === Number(month) - 1 && date.getDate() === Number(day) ? date : null;
}

/** The Monday of the week containing `date`, at local midnight. */
export function mondayOf(date: Date): Date {
	const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
	const weekday = monday.getDay();
	monday.setDate(monday.getDate() - (weekday === 0 ? 6 : weekday - 1));
	return monday;
}

/**
 * Narrow a month's week anchors to the weeks that can still change.
 *
 * A week that finished before `from` is settled: the coach reworks the plan
 * ahead of the runner, never behind them, so there is nothing to learn by
 * asking for it again. `coveredFrom` is the first day the resulting weeks
 * speak for — everything before it has to come from whatever the caller
 * already holds.
 *
 * Returns no anchors at all for a month entirely in the past, which is the
 * answer: nothing to fetch.
 */
export function weeksStillOpen(
	anchors: Date[],
	from: Date
): { anchors: Date[]; coveredFrom: string | null } {
	const cutoff = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime();

	const kept = anchors.filter((anchor) => {
		const weekEnd = mondayOf(anchor);
		weekEnd.setDate(weekEnd.getDate() + 7);
		return weekEnd.getTime() > cutoff;
	});

	return {
		anchors: kept,
		coveredFrom: kept.length > 0 ? toLocalDateString(mondayOf(kept[0])) : null
	};
}

/**
 * Whole weeks between now and race day, never negative.
 *
 * Rounds a part-week up: the last days before a race still read as a week to
 * go rather than as none, which is what a countdown is for.
 */
export function weeksRemaining(endDate: Date, now: Date): number {
	return Math.max(0, Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 7)));
}
