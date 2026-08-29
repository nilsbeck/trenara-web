import type { Schedule } from '$lib/server/trenara/types';
import { dayKeyOf } from './date';

/**
 * What `/api/v1/schedule` answers with.
 *
 * `covered_from` is the contract for a partial answer: the payload speaks for
 * every day from that date on, and says nothing about the days before it. On a
 * full month it is null, and the payload is the whole truth.
 */
export type SchedulePayload = Schedule & {
	covered_from?: string | null;
};

/**
 * The local `YYYY-MM-DD` an entry belongs to, or null if it has no usable one.
 *
 * `start_time` is an ISO instant, so it has to go through Date: a run at 23:30
 * in Berlin is dated the day before if you read the UTC string.
 *
 * An instant Date cannot read used to come back as `NaN-NaN-NaN` — a key that
 * matches no day, silently filing the entry nowhere. Null says the same thing
 * honestly, and callers comparing it against a date string skip the row.
 */
export function entryLocalDate(startTime: string | null | undefined): string | null {
	if (typeof startTime !== 'string') return null;

	const d = new Date(startTime);
	if (Number.isNaN(d.getTime())) return null;

	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	return `${y}-${m}-${day}`;
}

/**
 * Graft a partial month onto the one already in hand.
 *
 * Everything before `coveredFrom` is kept exactly as it was, because the
 * server was not asked about it; everything from `coveredFrom` on comes from
 * the answer, including its absences — a session deleted from a week the
 * server *did* speak for has to disappear, so this is a replacement of that
 * range rather than a union.
 *
 * Order is kept stable (old days first, then the fetched ones in the order
 * they arrived) so an unchanged month fingerprints identically and no swap
 * happens downstream.
 */
export function mergeSchedule(cached: Schedule, incoming: Schedule, coveredFrom: string): Schedule {
	// A row whose date cannot be read is dropped rather than kept: it cannot be
	// shown in any cell, and nothing that arrives later can replace it, so
	// keeping it would carry it through every merge for the life of the cache.
	const before = <T>(items: T[] | undefined, dateOf: (item: T) => string | null): T[] =>
		(items ?? []).filter((item) => {
			const date = dateOf(item);
			return date !== null && date < coveredFrom;
		});

	return {
		...incoming,
		trainings: [
			...before(cached.trainings, (t) => dayKeyOf(t.day_long)),
			...(incoming.trainings ?? [])
		],
		strength_trainings: [
			...before(cached.strength_trainings, (s) => dayKeyOf(s.day)),
			...(incoming.strength_trainings ?? [])
		],
		entries: [
			...before(cached.entries, (e) => entryLocalDate(e.start_time)),
			...(incoming.entries ?? [])
		]
	};
}
