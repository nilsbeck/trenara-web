/**
 * A dynamic `import()` that is started at most once, and started again only
 * after it failed.
 *
 * For the dialogs and sheets that only open on a tap: their code is left out
 * of the page's chunk (§7, "Heavy libraries used on a branch are imported on
 * that branch"), warmed once the page is idle (`whenIdle`), and awaited by the
 * tap that opens one — which then joins the request already made rather than
 * starting a second.
 *
 * A failed load is forgotten, so the next call tries again instead of
 * replaying the failure: a dropped connection on a train should not break a
 * button for the rest of the visit.
 */
export function loadOnce<T>(load: () => Promise<T>): () => Promise<T> {
	let pending: Promise<T> | null = null;

	return () => {
		if (!pending) {
			pending = load().catch((error: unknown) => {
				pending = null;
				throw error;
			});
		}
		return pending;
	};
}

/**
 * Run `task` once the browser has nothing better to do, and return a cancel.
 *
 * Idle rather than on mount: first paint and hydration are what the runner
 * waits on, and a chunk nobody has asked for yet must not compete with them.
 * Safari has no `requestIdleCallback`, so a short timeout stands in there.
 */
export function whenIdle(task: () => void): () => void {
	if (typeof window.requestIdleCallback === 'function') {
		const id = window.requestIdleCallback(task, { timeout: 3000 });
		return () => window.cancelIdleCallback(id);
	}
	const id = setTimeout(task, 1000);
	return () => clearTimeout(id);
}

/**
 * What a tap does when the chunk it needs cannot be fetched.
 *
 * Almost always a deploy: the page was built against chunk names the new
 * deployment no longer serves, and the service worker has already swapped its
 * precache for the new version. Nothing on the old page can fix that; a
 * reload lands on the new build, where the same tap works. Offline is the
 * other case, and there the reload shows the offline page, which says so
 * rather than leaving a button that silently does nothing.
 *
 * Only for a tap. A background warm-up that fails just stays quiet — the tap
 * will try again, and reloading a page nobody touched would be its own bug.
 */
export function reloadOnStaleChunk(error: unknown): void {
	console.error('[lazy] could not load a dialog, reloading:', error);
	window.location.reload();
}
