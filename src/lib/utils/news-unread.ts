import type { NewsItem } from '$lib/server/trenara/types';

/**
 * Unread bookkeeping for the in-app news feed.
 *
 * Trenara has no read state of its own — a news item carries an `id` and a
 * `created_at`, nothing more — so "have I read this?" is answered here, from a
 * single high-water mark per user: the newest item the reader has been shown.
 * News is append-only and arrives newest first, which makes one mark enough
 * and per-item read rows unnecessary.
 *
 * Two rules keep the badge honest, and both matter more than the counting:
 *
 * 1. A reader with no mark yet is not unread — they are new here. The mark is
 *    seeded to whatever is newest at that moment (see the badge loader) so the
 *    backlog they never asked for cannot raise a badge. The badge can only ever
 *    mean "something arrived since you last looked".
 * 2. An item nobody opened stops counting after {@link STALE_AFTER_DAYS}. A
 *    badge that sits there for months is nagging, not informing.
 */

/** The newest item a reader has been shown. */
export interface NewsMark {
	id: number;
	/** Unix seconds, matching `NewsItem.created_at`. */
	createdAt: number;
}

export interface UnreadSummary {
	count: number;
	/**
	 * True when the count is a floor rather than a total: every item on the
	 * page was unread and further pages exist, so there may be more behind it.
	 * Display as `${count}+`.
	 */
	capped: boolean;
}

/** How long an unopened item keeps counting as unread. */
export const STALE_AFTER_DAYS = 30;

const SECONDS_PER_DAY = 86400;

/** The mark for an item, as stored once the reader has been shown it. */
export function markOf(item: NewsItem): NewsMark {
	return { id: item.id, createdAt: item.created_at };
}

/**
 * Is `a` newer than `b`?
 *
 * Ordered on `created_at`, which is what the feed itself is ordered by. Ids
 * look monotonic but that has never been confirmed against the API, so they
 * only break ties between items published in the same second.
 */
export function isNewer(a: NewsMark, b: NewsMark): boolean {
	if (a.createdAt !== b.createdAt) return a.createdAt > b.createdAt;
	return a.id > b.id;
}

/** The newest of a page of items, or null when the page is empty. */
export function newestOf(items: NewsItem[]): NewsMark | null {
	return items.reduce<NewsMark | null>((newest, item) => {
		const mark = markOf(item);
		return newest === null || isNewer(mark, newest) ? mark : newest;
	}, null);
}

/**
 * Is this item unread — newer than the mark, and recent enough to still say so?
 *
 * `now` is unix seconds.
 */
export function isUnread(item: NewsItem, mark: NewsMark | null, now: number): boolean {
	// No mark means the reader has not been seeded yet: nothing is unread to
	// them, or every item would be.
	if (mark === null) return false;
	if (item.created_at <= now - STALE_AFTER_DAYS * SECONDS_PER_DAY) return false;
	return isNewer(markOf(item), mark);
}

/**
 * Count the unread items on a page of news.
 *
 * The badge is computed from page one alone — ten items, and anyone with ten
 * unread has stopped reading rather than fallen behind — so a full page with
 * more behind it reports itself as capped rather than pretending to be a total.
 */
export function summarizeUnread(
	items: NewsItem[],
	mark: NewsMark | null,
	now: number,
	hasMorePages = false
): UnreadSummary {
	const unread = items.filter((item) => isUnread(item, mark, now));
	return {
		count: unread.length,
		capped: hasMorePages && items.length > 0 && unread.length === items.length
	};
}

/** The badge label, e.g. `3` or `10+`. Empty when there is nothing to show. */
export function formatUnread(summary: UnreadSummary): string {
	if (summary.count <= 0) return '';
	return summary.capped ? `${summary.count}+` : `${summary.count}`;
}
