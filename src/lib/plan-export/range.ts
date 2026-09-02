import { mondayOf, parseLocalDateString, toLocalDateString } from '../utils/date';

/**
 * Which weeks have to be fetched to cover a date range.
 *
 * There is no month endpoint and no range endpoint — `/api/schedule/week/`
 * answers with the week containing whatever second it is handed — so a range is
 * a walk of Mondays. Both ends of the walk overhang the range (the Monday
 * before `from`, the Sunday after `to`); `buildExport` filters row by row on the
 * dates themselves, so the overhang costs a request and never reaches the output.
 */
export function weekAnchors(from: Date, to: Date): Date[] {
	const anchors: Date[] = [];
	const last = mondayOf(to).getTime();
	const cursor = mondayOf(from);

	// Guard rather than trust: an inverted range would otherwise return nothing
	// silently, and a decade-wide typo would try to fetch five hundred weeks.
	while (cursor.getTime() <= last && anchors.length < 260) {
		anchors.push(new Date(cursor));
		cursor.setDate(cursor.getDate() + 7);
	}
	return anchors;
}

/** The Unix second the week endpoint expects for an anchor. */
export function toUnixSeconds(date: Date): number {
	return Math.floor(date.getTime() / 1000);
}

/**
 * A `YYYY-MM-DD` argument as a local-midnight Date.
 *
 * Throws rather than returning null: this reads a command line, and a range
 * silently defaulted from a typo is how you export the wrong three months and
 * never notice.
 */
export function requireDate(value: string, label: string): Date {
	const parsed = parseLocalDateString(value);
	if (!parsed) throw new Error(`${label} must be a YYYY-MM-DD date, got "${value}"`);
	return parsed;
}

/** Today at local midnight, as `YYYY-MM-DD`. */
export function todayKey(now = new Date()): string {
	return toLocalDateString(now);
}
