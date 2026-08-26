import { browser } from '$app/environment';
import type { Entry, Schedule } from '$lib/server/trenara/types';

/**
 * Ratings this browser has sent that the schedule has not caught up with yet.
 *
 * The rating card and the star both decide what to ask for from one thing: the
 * `rpe` on the entry in the week payload. That payload is Trenara's read side,
 * and it has been seen to answer `null` for a session that had just been rated
 * and to keep doing so across a reload before eventually agreeing. With
 * nothing else in play the runner is asked for the same rating again on every
 * visit for as long as that lasts, and rating it again changes nothing.
 *
 * So a rating that has been sent is written down here, and read back over the
 * week payload until the week payload carries it itself.
 *
 * This is deliberately not a local copy of the truth:
 *
 * - It is dropped the moment the schedule's own copy of that entry carries a
 *   rating. Trenara is the record; this only covers the gap.
 * - It expires. A rating that never reached Trenara at all — a write it took
 *   and dropped — would otherwise be hidden here for good, and the runner
 *   would believe a rating existed that nothing has. Past the window the
 *   prompt comes back, which is the right outcome for a rating that was
 *   genuinely lost.
 * - A write that comes back saying the entry is *still* unrated never gets
 *   written down at all; that one is reported to the runner instead.
 */
const KEY = 'trenara:unconfirmed-rpe';

/**
 * How long a rating is held over the week payload.
 *
 * Long enough to outlast a read side that took hours to agree, short enough
 * that a rating which never landed is asked for again the next day rather than
 * quietly ceasing to exist.
 */
export const UNCONFIRMED_TTL_MS = 24 * 60 * 60 * 1000;

/** entry id → the rating sent for it, and when. */
type Remembered = Record<string, { rpe: number; at: number }>;

function read(now: number): Remembered {
	if (!browser) return {};

	try {
		const raw = window.localStorage.getItem(KEY);
		if (!raw) return {};

		const parsed: unknown = JSON.parse(raw);
		if (parsed === null || typeof parsed !== 'object') return {};

		const kept: Remembered = {};
		for (const [id, value] of Object.entries(parsed as Remembered)) {
			if (typeof value?.rpe !== 'number' || typeof value?.at !== 'number') continue;
			if (now - value.at >= UNCONFIRMED_TTL_MS) continue;
			kept[id] = value;
		}
		return kept;
	} catch {
		// Unreadable, unparseable, or storage the browser will not hand over.
		// A forgotten rating costs one extra prompt; a thrown error costs the
		// whole card.
		return {};
	}
}

function write(next: Remembered): void {
	if (!browser) return;

	try {
		if (Object.keys(next).length === 0) {
			window.localStorage.removeItem(KEY);
			return;
		}
		window.localStorage.setItem(KEY, JSON.stringify(next));
	} catch {
		// Full, or storage the browser will not hand over.
	}
}

/** Hold on to a rating that has been sent, until the week payload has it. */
export function rememberRating(entryId: number, rpe: number, now = Date.now()): void {
	const next = read(now);
	next[String(entryId)] = { rpe, at: now };
	write(next);
}

/** Stop holding one — it arrived, or it was refused. */
export function forgetRating(entryId: number, now = Date.now()): void {
	const next = read(now);
	if (!(String(entryId) in next)) return;

	delete next[String(entryId)];
	write(next);
}

/**
 * Read the ratings sent from this browser back over a schedule.
 *
 * Returns the schedule untouched when it has nothing to add, so the caller's
 * "did this change?" comparisons are not disturbed by a no-op. Entries the
 * schedule now rates itself are dropped from storage on the way past: that is
 * the read side catching up, and there is nothing left to cover.
 */
export function withRememberedRatings(schedule: Schedule, now = Date.now()): Schedule {
	const remembered = read(now);
	if (Object.keys(remembered).length === 0) return schedule;

	const entries = schedule.entries ?? [];
	let confirmed = false;
	let patched = false;

	const next: Entry[] = entries.map((entry) => {
		const held = remembered[String(entry.id)];
		if (!held) return entry;

		if (entry.rpe != null) {
			delete remembered[String(entry.id)];
			confirmed = true;
			return entry;
		}

		patched = true;
		return { ...entry, rpe: held.rpe };
	});

	if (confirmed) write(remembered);
	if (!patched) return schedule;

	return { ...schedule, entries: next };
}
