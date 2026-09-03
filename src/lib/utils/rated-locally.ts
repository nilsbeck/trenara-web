import type { Entry } from '$lib/server/trenara/types';

/**
 * Bridging the gap between a rating landing and the read that should show it.
 *
 * `PUT /api/entries/{id}/rpe` answers with the stored rating, and the store
 * seats it at once — but that is not the last read this entry will see. The
 * app is a serverless deployment: the instance that served the write and the
 * one that serves the very next page load are not necessarily the same
 * process, so the write's own cache invalidation (`read-cache.ts`) cannot be
 * relied on to reach whichever instance answers next. A reload straight after
 * rating — backgrounding the tab to submit, say, then coming back — can land
 * on an instance still holding the pre-rating week, or on a Trenara read that
 * has not caught up with its own write yet either way.
 *
 * Read fresh, that looks like the rating never happened: the prompt is back,
 * blurring the session it was just cleared off, and `initialCalendarDay`
 * opens on it again instead of moving on. So the browser remembers, for a few
 * minutes, what it was told just happened — long enough to outlast a stale
 * instance or a slow upstream read, short enough that a genuine later change
 * (the runner re-rates it in Trenara's own app) is not shadowed for good.
 */

const STORAGE_KEY = 'trenara:rated-locally';

/** How long a remembered rating outranks a fresher-looking read that disagrees. */
const TTL_MS = 5 * 60 * 1000;

type RatedStore = Record<string, { rpe: number; at: number }>;

function hasStorage(): boolean {
	return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

/**
 * What is currently remembered, pruned of anything past its TTL.
 *
 * Reads are tolerant of anything a browser can throw here — a private tab
 * that refuses storage, a value written by a future version of this key —
 * because none of it is worth losing the rating flow over. Worst case this
 * simply forgets, and the next fresh read is trusted as it always was before
 * this existed.
 */
function readStore(now: number): RatedStore {
	if (!hasStorage()) return {};

	try {
		const raw = window.localStorage.getItem(STORAGE_KEY);
		if (!raw) return {};

		const parsed: unknown = JSON.parse(raw);
		if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

		const pruned: RatedStore = {};
		for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
			if (
				value !== null &&
				typeof value === 'object' &&
				typeof (value as { rpe?: unknown }).rpe === 'number' &&
				typeof (value as { at?: unknown }).at === 'number' &&
				now - (value as { at: number }).at < TTL_MS
			) {
				pruned[id] = value as { rpe: number; at: number };
			}
		}
		return pruned;
	} catch {
		return {};
	}
}

function writeStore(store: RatedStore): void {
	if (!hasStorage()) return;
	try {
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
	} catch {
		// A full or disabled store costs this feature, not the rating itself —
		// the write to Trenara already happened.
	}
}

/**
 * Note that `entryId` was just rated `rpe`, for `reconcileRatedEntries` to
 * hold onto until a read agrees on its own.
 *
 * Called once the write to Trenara has actually succeeded — not before, and
 * not from a guess at what will happen — so this never remembers a rating
 * that was refused.
 */
export function rememberRating(entryId: number, rpe: number): void {
	if (!hasStorage()) return;

	const now = Date.now();
	const store = readStore(now);
	store[String(entryId)] = { rpe, at: now };
	writeStore(store);
}

/**
 * `entries`, with any still-unrated one this browser just rated patched back
 * in from local memory.
 *
 * A no-op, and the same array back, when nothing is remembered or every entry
 * already carries its own rating — the common case, so a schedule with
 * nothing to reconcile costs a lookup and nothing else.
 */
export function reconcileRatedEntries(entries: Entry[]): Entry[] {
	if (!hasStorage() || entries.length === 0) return entries;

	const now = Date.now();
	const store = readStore(now);
	if (Object.keys(store).length === 0) return entries;

	let changed = false;
	const patched = entries.map((entry) => {
		if (entry.rpe != null) return entry;
		const remembered = store[String(entry.id)];
		if (!remembered) return entry;
		changed = true;
		return { ...entry, rpe: remembered.rpe, ask_feedback: false };
	});

	return changed ? patched : entries;
}

/** Testing seam — the store lives in `localStorage`, which outlives a case. */
export function resetRatedLocally(): void {
	if (!hasStorage()) return;
	try {
		window.localStorage.removeItem(STORAGE_KEY);
	} catch {
		// Nothing to clean up if it was never writable.
	}
}
