/**
 * A refresh on the offline page means "try the live app again".
 *
 * The offline page is a page of its own (`/offline`), served from the
 * service worker's cache, so reloading it reloaded the copy: with the
 * connection back, a runner who pulled to refresh — the one gesture an
 * installed app has for "again" — stayed offline until they found the Retry
 * link. So a reload goes where Retry goes. When there is still no
 * connection, the worker answers that navigation with the offline page
 * again; it arrives as a redirect, not a reload, so it is not sent on again.
 */

/** Where Retry, and a reload, go: the page a launch opens on. */
export const LIVE_PAGE = '/dashboard';

/** The part of `Performance` this reads, so a test can hand in its own. */
type NavigationTiming = Pick<Performance, 'getEntriesByType'>;

/**
 * Whether this document was loaded by a reload rather than reached.
 *
 * Read from Navigation Timing, which records how the document was arrived
 * at. A browser without it (or a test environment) reads as not reloaded,
 * which leaves the page where it is — the behaviour before this existed.
 */
export function wasReloaded(
	timing: NavigationTiming | undefined = globalThis.performance
): boolean {
	try {
		const [entry] = timing?.getEntriesByType('navigation') ?? [];
		return (entry as PerformanceNavigationTiming | undefined)?.type === 'reload';
	} catch {
		return false;
	}
}

/**
 * Go to the live app, as a full page load the service worker answers.
 * `replace`, so Back does not return to a page saying it is offline.
 */
export function goLive(): void {
	window.location.replace(LIVE_PAGE);
}
