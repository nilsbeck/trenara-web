import type { Schedule } from '$lib/server/trenara/types';

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
 * The local `YYYY-MM-DD` an entry belongs to.
 *
 * `start_time` is an ISO instant, so it has to go through Date: a run at 23:30
 * in Berlin is dated the day before if you read the UTC string.
 */
export function entryLocalDate(startTime: string): string {
	const d = new Date(startTime);
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
	const before = <T>(items: T[] | undefined, dateOf: (item: T) => string): T[] =>
		(items ?? []).filter((item) => dateOf(item) < coveredFrom);

	return {
		...incoming,
		trainings: [
			...before(cached.trainings, (t) => t.day_long.slice(0, 10)),
			...(incoming.trainings ?? [])
		],
		strength_trainings: [
			...before(cached.strength_trainings, (s) => s.day.slice(0, 10)),
			...(incoming.strength_trainings ?? [])
		],
		entries: [
			...before(cached.entries, (e) => entryLocalDate(e.start_time)),
			...(incoming.entries ?? [])
		]
	};
}
