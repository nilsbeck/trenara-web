import type { Entry } from '$lib/server/trenara/types';

/**
 * What became of a rating.
 *
 * - `stored` — the API answered with the entry, carrying the rating. This is
 *   the only outcome that proves anything was written.
 * - `unconfirmed` — the write was accepted but the answer says nothing about
 *   the entry, so there is nothing here to check it against.
 * - `dropped` — the API answered with the entry and the rating is *not* on it.
 *   A 2xx that changed nothing; see `rateEntry` below.
 */
export type RateOutcome =
	{ status: 'stored'; rpe: number } | { status: 'unconfirmed' } | { status: 'dropped' };

/** The rating on an entry-shaped answer, or `undefined` if it is not one. */
function ratingOf(answer: unknown): number | null | undefined {
	if (answer === null || typeof answer !== 'object') return undefined;

	// Nothing pins down how this endpoint wraps what it returns, so the entry
	// is looked for at the top level and one level in before giving up.
	const candidates: unknown[] = [answer, (answer as { entry?: unknown }).entry];

	for (const candidate of candidates) {
		if (candidate === null || typeof candidate !== 'object') continue;
		if (!('rpe' in candidate)) continue;

		const rpe = (candidate as Pick<Entry, 'rpe'>).rpe;
		if (typeof rpe === 'number' || rpe === null) return rpe;
	}

	return undefined;
}

/**
 * Record how hard a session felt.
 *
 * A 2xx is deliberately not treated as proof on its own. A rating used to be
 * shown as saved on the strength of one, and an entry that came back unrated
 * the next time the schedule was fetched was the first anyone heard of it —
 * the runner was asked for the same rating again on the next reload. So where
 * the answer carries the entry, the rating is read back off it and the caller
 * is told which of the three things actually happened.
 *
 * Throws on a refused write; the message is the one the API gave.
 */
export async function rateEntry(entryId: number, rpe: number): Promise<RateOutcome> {
	const res = await fetch('/api/v1/feedback', {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ entryId, feedback: rpe })
	});

	if (!res.ok) {
		const body = await res.json().catch(() => null);
		throw new Error(body?.message ?? `Failed to save feedback (${res.status})`);
	}

	const stored = ratingOf(await res.json().catch(() => null));

	if (stored === undefined) return { status: 'unconfirmed' };
	if (stored === null) return { status: 'dropped' };
	return { status: 'stored', rpe: stored };
}

/** What to tell the runner when the API took the rating and kept nothing. */
export const DROPPED_MESSAGE =
	'Trenara accepted the rating but did not record it. Please try again.';
