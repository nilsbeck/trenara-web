import type { Entry } from '$lib/server/trenara/types';

/**
 * The updated entry out of a `PUT /api/v1/feedback` response, when it is one.
 *
 * Rating a session answers with the whole entry rather than an
 * acknowledgement, which is what lets the calendar adopt the server's copy
 * instead of patching its own from the value it sent. That is only safe if the
 * body really is the entry that was rated: a proxy standing in for the app, or
 * a future upstream that answers `204`, would otherwise put something that is
 * not an `Entry` into the week.
 *
 * So this checks the two things the swap depends on — that the body is an
 * object carrying the id that was rated, and that `rpe` came back a number —
 * and nothing else. Deliberately not a schema: a strict one would reject the
 * API's own additions, and the caller already has a correct fallback for
 * `null` (keep the rating it made locally).
 */
export function ratedEntry(body: unknown, entryId: number): Entry | null {
	if (body === null || typeof body !== 'object' || Array.isArray(body)) return null;

	const candidate = body as Partial<Entry>;
	if (candidate.id !== entryId || typeof candidate.rpe !== 'number') return null;

	return candidate as Entry;
}
