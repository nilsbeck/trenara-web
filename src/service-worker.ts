/// <reference types="@sveltejs/kit" />
/// <reference lib="webworker" />

import { build, files, version } from '$service-worker';

/**
 * What the app does with no connection.
 *
 * It is installable — there is a manifest and a set of icons — so it can be on
 * a home screen, which is exactly where a running app belongs. Opened from
 * there with no signal it was a blank white page: no shell, no explanation,
 * nothing the error page could help with, because nothing loaded at all.
 *
 * What is cached, and what is deliberately not:
 *
 * - **The shell** — the built JS and CSS, the icons, the offline page. All
 *   content-hashed or static, so serving them from disk cannot be wrong.
 * - **Nothing else.** No API responses and no rendered pages. Both carry the
 *   runner's training plan, and a plan served from disk without saying so is
 *   the same lie this app has spent its error handling removing: yesterday's
 *   session shown as today's, a completed run missing, a change that appears
 *   not to have saved. It would also outlive a logout, sitting in Cache
 *   Storage until something evicted it.
 *
 * So offline gets the shell and an honest page saying so, rather than a
 * plausible-looking plan that might be days old.
 */

const sw = self as unknown as ServiceWorkerGlobalScope;

/** Versioned by the build, so a deploy cannot be served half old and half new. */
const CACHE = `trainara-${version}`;

/** Everything worth having on disk: the built app, and the static files. */
const PRECACHE = [...build, ...files];

/**
 * The page shown for a navigation that cannot reach the network.
 *
 * Taken from `files` rather than written out, because those paths carry the
 * app's base path and a literal `/offline.html` would silently miss the cache
 * the day this is ever served from a sub-path.
 */
const OFFLINE_PAGE = files.find((file) => file.endsWith('/offline.html'));

sw.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(CACHE)
			.then((cache) => cache.addAll(PRECACHE))
			// Take over immediately rather than waiting for every tab to close:
			// the shell is versioned, so there is no half-updated state to fear.
			.then(() => sw.skipWaiting())
	);
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) =>
				Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))
			)
			.then(() => sw.clients.claim())
	);
});

/** Whether a URL is one of the files precached at install. */
function isPrecached(url: URL): boolean {
	return url.origin === sw.location.origin && PRECACHE.includes(url.pathname);
}

sw.addEventListener('fetch', (event) => {
	const { request } = event;

	// Only reads, and only ordinary web requests: a POST must never be answered
	// from disk, and `chrome-extension:` and friends cannot be cached at all.
	if (request.method !== 'GET') return;

	const url = new URL(request.url);
	if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

	// The shell. Content-hashed by the build, so the cached copy is the right
	// copy — no revalidation needed, and it works with no connection.
	if (isPrecached(url)) {
		event.respondWith(caches.match(request).then((cached) => cached ?? fetch(request)));
		return;
	}

	// A page. Always the network first, because the page carries the plan and
	// the plan is the thing that must not be stale. Only when the network is
	// gone entirely does the offline page stand in — and it says what it is,
	// rather than showing an empty calendar that reads as a rest week.
	if (request.mode === 'navigate') {
		event.respondWith(
			fetch(request).catch(async () => {
				const offline = OFFLINE_PAGE ? await caches.match(OFFLINE_PAGE) : undefined;
				return (
					offline ??
					new Response('Offline', {
						status: 503,
						headers: { 'content-type': 'text/plain; charset=utf-8' }
					})
				);
			})
		);
		return;
	}

	// Everything else — `/api/**` above all — goes to the network untouched and
	// is never stored. Left alone, so a failure reaches the app's own error
	// handling rather than being answered from disk behind its back.
});
