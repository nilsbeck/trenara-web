import { version } from '$app/env';
import { assets, immutable, prerendered } from '$app/manifest';
// Typed as `ServiceWorkerGlobalScope` by SvelteKit 3, which is what the
// `self as unknown as ServiceWorkerGlobalScope` cast here used to assert.
import { self as sw } from '$app/service-worker';

/**
 * What the app does with no connection, and with a slow one.
 *
 * It is installable — there is a manifest and a set of icons — so it can be on
 * a home screen, which is exactly where a running app belongs. Opened from
 * there with no signal it was a blank white page: no shell, no explanation,
 * nothing the error page could help with, because nothing loaded at all.
 *
 * What is cached, and what is deliberately not:
 *
 * - **The shell** — the built JS and CSS, the icons, the static offline page.
 *   All content-hashed or static, so serving them from disk cannot be wrong.
 * - **The launch placeholder** (`src/routes/launch`) — the frame of the app
 *   and a line saying the plan is loading, prerendered at build time. It is
 *   the same file for everyone and holds nothing of the runner's, so it is
 *   shell in the same sense: it cannot be out of date about anything.
 * - **The offline calendar** (`src/routes/offline`) — prerendered the same
 *   way and holding nothing of the runner's either. It draws the plan the
 *   dashboard kept in this browser's storage (`#lib/utils/offline-plan`),
 *   read-only, under a line saying it is offline and when the plan was saved.
 *   That copy is kept by the app rather than as a cached response, it is
 *   cleared on logout, and it is never served as if it were the live page.
 * - **Nothing else.** No API responses and no page rendered for a runner.
 *   Both carry the runner's training plan, and a plan served from disk
 *   without saying so is the same lie this app has spent its error handling
 *   removing: yesterday's session shown as today's, a completed run missing,
 *   a change that appears not to have saved. It would also outlive a logout,
 *   sitting in Cache Storage until something evicted it.
 *
 * So offline gets the plan as it was last seen, saying so and saying from
 * when, rather than a plausible-looking plan passed off as today's; and a slow start gets the
 * shell and an honest line saying the plan is on its way (`navigate` below).
 */

/** Versioned by the build, so a deploy cannot be served half old and half new. */
const CACHE = `trainara-${version}`;

/**
 * A manifest path as the pathname the browser will request.
 *
 * SvelteKit 3's manifest paths are relative to the base path and carry no
 * leading slash (`_app/immutable/…`), where `$service-worker` used to hand
 * out absolute ones. Compared as they come, not one would equal a request's
 * `url.pathname` and the shell would never be served from disk. The worker is
 * itself served from the base path, so resolving against its own location
 * puts the base back on without naming it.
 */
function pathnameOf({ path }: { path: string }): string {
	return new URL(path, sw.location.href).pathname;
}

/** Everything worth having on disk: the built app, the static files, the placeholder. */
const PRECACHE = [...immutable, ...assets, ...prerendered].map(pathnameOf);

/**
 * The page shown for a navigation that cannot reach the network, when the
 * offline calendar below is not on disk.
 *
 * Taken from the manifest rather than written out, because those paths carry
 * the app's base path and a literal `/offline-fallback.html` would silently
 * miss the cache the day this is ever served from a sub-path.
 */
const OFFLINE_PAGE = PRECACHE.find((file) => file.endsWith('/offline-fallback.html'));

/**
 * The offline calendar, found the same way.
 *
 * The static page was `offline.html` until this one arrived, and SvelteKit
 * writes a prerendered `/offline` to exactly that file — the build silently
 * put one in place of the other. Hence the static page's longer name.
 */
const OFFLINE_PLAN_PAGE = PRECACHE.find((file) => file.endsWith('/offline'));

/** The page that stands in for a dashboard still on its way, found the same way. */
const LAUNCH_PLACEHOLDER = PRECACHE.find((file) => file.endsWith('/launch'));

/** The page a launch opens on — the manifest's `start_url` — and the one the placeholder is for. */
const DASHBOARD = pathnameOf({ path: 'dashboard' });

/**
 * How long a launch shows nothing before the placeholder stands in.
 *
 * Short enough that a slow start shows the app almost at once — the splash
 * screen, or on iOS a blank one, was all a runner saw for the several seconds
 * a slow connection takes. Long enough that a quick start, a warm server on a
 * good signal, goes straight to the dashboard without a placeholder flashing
 * past on the way.
 */
const PLACEHOLDER_AFTER_MS = 300;

/**
 * How long a dashboard held behind a placeholder waits to be collected.
 *
 * The placeholder asks for it as soon as it has loaded, within a frame or two
 * of being served, so this is only the ceiling for one that never asks — the
 * app closed the moment it opened — and keeps a response from being held for
 * the life of the worker.
 */
const HANDOVER_WINDOW_MS = 10_000;

/**
 * How long a held dashboard may take to answer before its hand-over stops
 * waiting for it and asks the server again.
 *
 * The server gives up at 15 seconds (`maxDuration` in `vite.config.ts`), so a
 * request with no answer after 20 is not going to get one. Without a ceiling,
 * a request that never answered — whatever the reason — left the placeholder
 * on screen for good, in a home-screen app that has no reload button.
 */
const HELD_CEILING_MS = 20_000;

interface HeldPage {
	page: Promise<Response>;
	/** When the request behind `page` was sent, for `HELD_CEILING_MS`. */
	since: number;
	collect: () => void;
}

/**
 * Dashboards in flight behind a placeholder, by URL, until the navigation the
 * placeholder starts collects them. Held in memory and never in Cache Storage:
 * each is one response to one request, handed over once and then gone.
 */
const held = new Map<string, HeldPage>();

const ignore = () => {};

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

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
		Promise.all([
			caches
				.keys()
				.then((keys) =>
					Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))
				),
			/**
			 * Navigation preload off — on purpose, and turned off rather than
			 * left alone, because an earlier version of this worker turned it on
			 * and the setting outlives the worker that made it.
			 *
			 * Preload sends the page request while the browser is still starting
			 * this worker, which saves the worker's start-up time on a cold
			 * launch: tens to a couple of hundred milliseconds. It was on until
			 * the launch placeholder (`navigate` below) needed to hand a request
			 * from one navigation to the next. In Safari that hand-over hung — the
			 * placeholder stayed up, and the server's log showed no request for
			 * that launch — while it worked in Chromium. The likeliest reason,
			 * not confirmed in WebKit itself: a preloaded request belongs to the
			 * browser and the navigation it was sent for, and does not survive
			 * being handed to another. A request this worker makes itself is a
			 * plain promise, which it can hand to any navigation in any browser.
			 * The placeholder covers the start-up time this costs; a launch that
			 * hangs, nothing covers.
			 *
			 * Optional: Safari before 15.4 has no `navigationPreload` at all.
			 */
			sw.registration.navigationPreload?.disable()
		]).then(() => sw.clients.claim())
	);
});

/**
 * What a navigation that could not reach the network is answered with: a
 * redirect to the offline calendar, or failing that the static offline page.
 *
 * A redirect rather than the calendar served at the URL asked for: its script
 * is that of `/offline`, and hydrating it under `/dashboard` would have the
 * router treating it as the dashboard. At its own address it is what it says
 * it is, and its "Retry" goes back to the dashboard.
 */
async function offlinePage(): Promise<Response> {
	if (OFFLINE_PLAN_PAGE && (await caches.match(OFFLINE_PLAN_PAGE))) {
		return Response.redirect(new URL(OFFLINE_PLAN_PAGE, sw.location.href).href, 302);
	}
	const offline = OFFLINE_PAGE ? await caches.match(OFFLINE_PAGE) : undefined;
	return (
		offline ??
		new Response('Offline', {
			status: 503,
			headers: { 'content-type': 'text/plain; charset=utf-8' }
		})
	);
}

/**
 * Whether a navigation may be stood in for: the dashboard, loaded as a
 * window's own page, at exactly its plain URL.
 *
 * The plain URL because that is what the placeholder asks for when it hands
 * over, and the held page is found by its URL; a query string would leave it
 * uncollected. A window's page, because a frame has no launch to cover.
 */
function standsInFor(request: Request): boolean {
	const url = new URL(request.url);
	return request.destination === 'document' && url.pathname === DASHBOARD && url.search === '';
}

/**
 * The placeholder as the answer to a navigation that asked for the dashboard.
 *
 * Rebuilt rather than returned as it came from the cache: a response made here
 * carries no URL of its own, so the document takes the one it was asked for —
 * the dashboard's, which is the address the runner opened, the one the
 * placeholder hands over to, and the one its relative stylesheet links resolve
 * against.
 */
function standIn(placeholder: Response): Response {
	return new Response(placeholder.body, {
		status: 200,
		headers: { 'content-type': 'text/html; charset=utf-8' }
	});
}

/**
 * Keep a dashboard in flight for the navigation the placeholder will start,
 * and return what the worker has to stay alive for.
 *
 * The response is asked for from this event but delivered through another
 * one, so a worker that stopped once this event had answered would take the
 * request in flight with it. It stays alive until the page has arrived in
 * full, read through a copy, not merely until it has started arriving: the
 * page reaches the window through the hand-over, and its body is still
 * streaming through this worker after the hand-over has been answered. No
 * longer than `HELD_CEILING_MS`, though, for a request that never answers.
 */
function hold(url: string, page: Promise<Response>, since: number): Promise<unknown> {
	let collect: () => void = ignore;
	const collected = new Promise<void>((resolve) => (collect = resolve));

	let arrived: Promise<unknown> = Promise.resolve();
	const kept = page.then((response) => {
		// Copied before anything else can read it: the hand-over below only ever
		// sees `kept`, which settles after this has run.
		arrived = response.clone().arrayBuffer().catch(ignore);
		return response;
	});
	kept.catch(ignore);
	held.set(url, { page: kept, since, collect });

	const released = Promise.race([collected, delay(HANDOVER_WINDOW_MS)]).then(() => {
		if (held.get(url)?.page === kept) held.delete(url);
	});

	return Promise.all([
		released,
		Promise.race([kept.then(() => arrived, ignore), delay(HELD_CEILING_MS)])
	]);
}

interface Answer {
	/** What the navigation is answered with. */
	response: Promise<Response>;
	/** What the worker must stay alive for after that. */
	lifetime: Promise<unknown>;
}

/**
 * The page asked for again, as a fresh request, when the held one failed or
 * never answered.
 *
 * Past the browser's cache, because otherwise the browser queues it behind
 * the request it replaces. Chromium was seen holding a second request for the
 * dashboard back until the first had answered — a first request stalled for
 * 25 seconds kept its replacement off the network for all 25, and the
 * ceiling saved nothing.
 */
function askAgain(request: Request): Promise<Response> {
	return fetch(new Request(request, { cache: 'no-store' }));
}

/**
 * The navigation the placeholder started: answered with the dashboard already
 * in flight, rather than by asking the server again.
 *
 * Should the held request fail, or still have no answer `HELD_CEILING_MS`
 * after it was sent, the network is asked once more before the offline page —
 * the hand-over is what failed, not necessarily the connection.
 */
function collect(event: FetchEvent, handover: HeldPage): Answer {
	held.delete(event.request.url);
	handover.collect();

	const waited = Math.max(0, HELD_CEILING_MS - (Date.now() - handover.since));
	const page = Promise.race([
		handover.page,
		delay(waited).then(() => Promise.reject(new Error('The held dashboard never answered')))
	]);

	return {
		response: page.catch(() => askAgain(event.request)).catch(offlinePage),
		lifetime: page.catch(ignore)
	};
}

/**
 * A page: always the network, because the page carries the plan and the plan
 * is the thing that must not be stale — with two things standing in when it
 * cannot answer.
 *
 * - **No network at all**: the offline calendar, which says what it is and
 *   when its plan was saved (`offlinePage`).
 * - **A dashboard slow to arrive**: the launch placeholder, once the request
 *   has gone `PLACEHOLDER_AFTER_MS` without an answer. The request is not
 *   abandoned. It is held here, and the placeholder at once starts a
 *   navigation to the dashboard again (a meta refresh in its head), which
 *   `collect` answers with that same held request. The window keeps showing
 *   the placeholder while that navigation is pending, and the dashboard
 *   replaces it the moment it arrives: one request to the server, as before,
 *   and something on screen in the meantime. Two navigations rather than one
 *   because a document cannot be partly one page and partly another, and a
 *   service worker answers each navigation exactly once.
 */
function navigate(event: FetchEvent): Answer {
	const { request } = event;

	const handover = held.get(request.url);
	if (handover) return collect(event, handover);

	const sent = Date.now();
	const page = fetch(event.request);
	const settled = page.then(ignore, ignore);

	if (!LAUNCH_PLACEHOLDER || !standsInFor(request)) {
		return { response: page.catch(offlinePage), lifetime: settled };
	}
	const placeholderPath = LAUNCH_PLACEHOLDER;

	// The lifetime depends on which way the race goes, and `waitUntil` has to be
	// handed it before the race is run.
	let settle: (lifetime: Promise<unknown>) => void = ignore;
	const lifetime = new Promise<unknown>((resolve) => (settle = resolve));

	const response = Promise.race([
		settled.then(() => true),
		delay(PLACEHOLDER_AFTER_MS).then(() => false)
	]).then(async (inTime) => {
		const placeholder = inTime
			? undefined
			: await caches.match(placeholderPath).catch(() => undefined);

		// In time, or late with no placeholder to show: wait for the page, as
		// every other navigation does.
		if (!placeholder) {
			settle(settled);
			return page.catch(offlinePage);
		}

		settle(hold(request.url, page, sent));
		return standIn(placeholder);
	});

	return { response, lifetime };
}

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

	// A page — see `navigate` for what answers it.
	if (request.mode === 'navigate') {
		const { response, lifetime } = navigate(event);
		event.respondWith(response);
		event.waitUntil(lifetime);
		return;
	}

	// Everything else — `/api/**` above all — goes to the network untouched and
	// is never stored. Left alone, so a failure reaches the app's own error
	// handling rather than being answered from disk behind its back.
});
