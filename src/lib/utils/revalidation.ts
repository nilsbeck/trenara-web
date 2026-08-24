/**
 * Deciding when the data on screen has had its day — and it is very nearly
 * that literal.
 *
 * There are only two ways the plan changes. A session the runner edits comes
 * back from the mutation in full, so the store patches it in and nothing needs
 * fetching. Everything else happens overnight, when the coach's processing
 * reworks the week. That is the whole of it: no push to subscribe to (the
 * official app is told over Firebase Cloud Messaging, addressed to its own
 * registrations), and nothing else that moves during the day.
 *
 * So this does not poll. It watches a single question — is what we are looking
 * at from before today? — and asks the server again only when the answer is
 * yes. A tab opened each morning refreshes once. A tab left open for a week
 * refreshes once a day. The events below are just chances to ask the question;
 * none of them causes a request on its own.
 */

export type RevalidationReason = 'new-day' | 'max-age';

export interface RevalidationTriggerOptions {
	/**
	 * When what is on screen was last known to be current, or null if nothing
	 * has loaded yet — in which case there is nothing to revalidate.
	 */
	lastUpdatedAt: () => number | null;
	/** Called when the data is out of date. The only thing that costs a request. */
	onTrigger: (reason: RevalidationReason) => void;
	/**
	 * Called on every check, whether or not the data turned out to be stale.
	 * Free, local work only — noticing that midnight has passed, say.
	 */
	onCheck?: () => void;
	/**
	 * A backstop for the one case the day boundary misses: overnight processing
	 * lands in the small hours, so a tab that refreshed at 00:01 holds a plan
	 * from before the rework and is, by the day rule, perfectly current.
	 */
	maxAgeMs?: number;
	/** How often to ask the question locally. No request unless the answer is yes. */
	checkIntervalMs?: number;
	/** Floor between two requests, so a failing refresh cannot become a retry storm. */
	minGapMs?: number;
	now?: () => number;
}

export interface RevalidationTrigger {
	stop: () => void;
}

export const DEFAULT_MAX_AGE_MS = 6 * 60 * 60 * 1000;
export const DEFAULT_CHECK_INTERVAL_MS = 5 * 60 * 1000;
export const DEFAULT_MIN_GAP_MS = 60 * 1000;

/** Local calendar day. Deliberately local: "overnight" means the runner's night. */
export function localDayKey(date: Date): string {
	return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

/**
 * Whether data last confirmed at `lastUpdatedAt` should be fetched again, and
 * why. Null means it is still good.
 */
export function stalenessReason(
	lastUpdatedAt: number | null,
	nowMs: number,
	maxAgeMs: number = DEFAULT_MAX_AGE_MS
): RevalidationReason | null {
	// Nothing on screen yet: whatever is loading it owns that, not us.
	if (lastUpdatedAt === null) return null;
	// The day boundary is asked first because it is the real reason — the age
	// backstop below is only there for the hours either side of it.
	if (localDayKey(new Date(lastUpdatedAt)) !== localDayKey(new Date(nowMs))) return 'new-day';
	if (nowMs - lastUpdatedAt >= maxAgeMs) return 'max-age';
	return null;
}

export function createRevalidationTrigger(
	options: RevalidationTriggerOptions
): RevalidationTrigger {
	const {
		lastUpdatedAt,
		onTrigger,
		onCheck,
		maxAgeMs = DEFAULT_MAX_AGE_MS,
		checkIntervalMs = DEFAULT_CHECK_INTERVAL_MS,
		minGapMs = DEFAULT_MIN_GAP_MS,
		now = Date.now
	} = options;

	// Nothing to listen to while rendering on the server.
	if (typeof window === 'undefined' || typeof document === 'undefined') {
		return { stop: () => {} };
	}

	let lastTriggeredAt: number | null = null;

	function check() {
		onCheck?.();

		const nowMs = now();
		const reason = stalenessReason(lastUpdatedAt(), nowMs, maxAgeMs);
		if (!reason) return;

		// A refresh that failed leaves the data stale, so the next check would ask
		// again immediately. Once a minute is enough to recover from that.
		if (lastTriggeredAt !== null && nowMs - lastTriggeredAt < minGapMs) return;

		lastTriggeredAt = nowMs;
		onTrigger(reason);
	}

	function handleVisibility() {
		if (document.visibilityState !== 'visible') return;
		check();
	}

	document.addEventListener('visibilitychange', handleVisibility);
	window.addEventListener('focus', check);
	const timer = setInterval(() => {
		// Hidden tabs are left alone; the visibility handler catches them the
		// moment anyone looks, which is the only moment it matters.
		if (document.visibilityState !== 'visible') return;
		check();
	}, checkIntervalMs);

	return {
		stop() {
			document.removeEventListener('visibilitychange', handleVisibility);
			window.removeEventListener('focus', check);
			clearInterval(timer);
		}
	};
}
