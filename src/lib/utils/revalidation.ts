/**
 * Deciding when the data on screen has had its day.
 *
 * The coach reschedules overnight — a session moves, a distance changes — and
 * a tab left open since yesterday evening goes on showing the plan as it was.
 * Nothing pushes that news to us: the official app is told over Firebase
 * Cloud Messaging, which is addressed to that app's own registrations and is
 * not something a third-party web client can subscribe to. So this app has to
 * ask again, at the moments it is most likely to be holding something stale.
 *
 * Those moments are cheap to spot: the tab becoming visible, the window
 * regaining focus, the network coming back, a timer ticking over while the
 * page is on screen — and, the one that matters for an overnight change, the
 * local calendar day rolling over under a page that never closed.
 */

export type RevalidationReason = 'visible' | 'focus' | 'online' | 'interval' | 'day-change';

export interface RevalidationTriggerOptions {
	/** Called when something suggests the data may have moved on without us. */
	onTrigger: (reason: RevalidationReason) => void;
	/** How often to look while the page is open. */
	intervalMs?: number;
	/**
	 * Floor between two triggers. Alt-tabbing repeatedly should not turn into a
	 * request per keystroke; a day change and a reconnect ignore it, because
	 * both mean the data really is suspect.
	 */
	minGapMs?: number;
	now?: () => number;
	/** Injectable so day rollover can be tested without waiting for midnight. */
	dayKey?: () => string;
}

export interface RevalidationTrigger {
	stop: () => void;
}

export const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;
export const DEFAULT_MIN_GAP_MS = 60 * 1000;

/** Local calendar day. Deliberately local: "overnight" means the runner's night. */
export function localDayKey(date: Date = new Date()): string {
	return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

export function createRevalidationTrigger(
	options: RevalidationTriggerOptions
): RevalidationTrigger {
	const {
		onTrigger,
		intervalMs = DEFAULT_INTERVAL_MS,
		minGapMs = DEFAULT_MIN_GAP_MS,
		now = Date.now,
		dayKey = localDayKey
	} = options;

	// Nothing to listen to while rendering on the server.
	if (typeof window === 'undefined' || typeof document === 'undefined') {
		return { stop: () => {} };
	}

	let lastTriggeredAt = now();
	let lastDay = dayKey();

	function fire(reason: RevalidationReason, force = false) {
		if (!force && now() - lastTriggeredAt < minGapMs) return;
		lastTriggeredAt = now();
		onTrigger(reason);
	}

	/** True when it fired, so the caller does not also fire its own weaker reason. */
	function checkDayRollover(): boolean {
		const today = dayKey();
		if (today === lastDay) return false;
		lastDay = today;
		fire('day-change', true);
		return true;
	}

	function handleVisibility() {
		if (document.visibilityState !== 'visible') return;
		if (!checkDayRollover()) fire('visible');
	}

	function handleFocus() {
		if (!checkDayRollover()) fire('focus');
	}

	function handleOnline() {
		fire('online', true);
	}

	function handleInterval() {
		// The rollover check runs even while hidden: a machine that slept through
		// midnight wakes with the tab still hidden, and the day is already wrong.
		if (checkDayRollover()) return;
		if (document.visibilityState !== 'visible') return;
		fire('interval');
	}

	document.addEventListener('visibilitychange', handleVisibility);
	window.addEventListener('focus', handleFocus);
	window.addEventListener('online', handleOnline);
	const timer = setInterval(handleInterval, intervalMs);

	return {
		stop() {
			document.removeEventListener('visibilitychange', handleVisibility);
			window.removeEventListener('focus', handleFocus);
			window.removeEventListener('online', handleOnline);
			clearInterval(timer);
		}
	};
}
