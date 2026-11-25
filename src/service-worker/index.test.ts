import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * The worker, driven through its own event listeners.
 *
 * It registers everything at module scope against `self`, so each case
 * imports a fresh copy against a fake scope, then fires the events a browser
 * would and reads back what the worker answered with.
 */

type Listener = (event: unknown) => void;

const scope = vi.hoisted(() => ({
	listeners: new Map<string, Listener>(),
	enablePreload: vi.fn(async () => undefined),
	disablePreload: vi.fn(async (): Promise<void> => undefined),
	claim: vi.fn(async () => undefined),
	skipWaiting: vi.fn(async () => undefined),
	preloadSupported: true,
	/** Whether the offline calendar is on disk; off unless a case says so. */
	offlinePlanCached: false
}));

vi.mock('$app/env', () => ({ version: 'test-build' }));
vi.mock('$app/manifest', () => ({
	immutable: [{ path: '_app/immutable/entry/start.js' }],
	assets: [{ path: 'offline-fallback.html' }, { path: 'logo.svg' }],
	prerendered: [{ path: 'launch' }, { path: 'offline' }]
}));
vi.mock('$app/service-worker', () => ({
	self: {
		location: new URL('https://trainara.test/service-worker.js'),
		addEventListener: (type: string, listener: Listener) => scope.listeners.set(type, listener),
		skipWaiting: scope.skipWaiting,
		clients: { claim: scope.claim },
		get registration() {
			return scope.preloadSupported
				? { navigationPreload: { enable: scope.enablePreload, disable: scope.disablePreload } }
				: {};
		}
	}
}));

const OFFLINE = new Response('offline page', { status: 200 });
const OFFLINE_PLAN = new Response('offline calendar', { status: 200 });
const PLACEHOLDER = new Response('launch placeholder', {
	status: 200,
	headers: { 'content-type': 'text/html', etag: '"build"' }
});
const addAll = vi.fn(async (_files: string[]) => undefined);
const cacheStorage = {
	open: vi.fn(async () => ({ addAll })),
	keys: vi.fn(async () => ['trainara-old-build', 'trainara-test-build']),
	delete: vi.fn(async () => true),
	match: vi.fn(async (key: unknown) => {
		const path = key instanceof Request ? new URL(key.url).pathname : key;
		if (path === '/offline-fallback.html') return OFFLINE.clone();
		if (path === '/launch') return PLACEHOLDER.clone();
		if (path === '/offline' && scope.offlinePlanCached) return OFFLINE_PLAN.clone();
		return undefined;
	})
};
const network = vi.fn<(request: unknown) => Promise<Response>>();

/**
 * Fire an event and hand back, unawaited, what the worker answered with
 * (`respondWith`) and what it asked to be kept alive for (`waitUntil`).
 */
function dispatch(type: string, fields: Record<string, unknown> = {}) {
	let response: Promise<Response> | undefined;
	let lifetime: Promise<unknown> | undefined;
	const event = {
		...fields,
		waitUntil: (p: Promise<unknown>) => (lifetime = p),
		respondWith: (p: Promise<Response>) => (response = p)
	};
	scope.listeners.get(type)?.(event);
	return { response, lifetime };
}

/** What the worker answered with — or, for an event it does not answer, waited on. */
async function fire(type: string, fields: Record<string, unknown> = {}) {
	const { response, lifetime } = dispatch(type, fields);
	return response ? await response : lifetime === undefined ? undefined : await lifetime;
}

/**
 * A page navigation as the browser hands it to the worker: a window's own page
 * unless said otherwise, and with no preload — the worker turns preload off.
 */
function navigation(
	path: string,
	{
		destination = 'document',
		preloadResponse
	}: { destination?: string; preloadResponse?: Promise<Response | undefined> } = {}
) {
	// A real Request, so that the worker can ask for it again with options of
	// its own; `mode` and `destination` are what the browser would set, and a
	// script cannot.
	const request = Object.defineProperties(new Request(`https://trainara.test${path}`), {
		mode: { value: 'navigate' },
		destination: { value: destination }
	});
	return { request, preloadResponse };
}

/** A promise the test settles by hand — a response still on its way. */
function deferred<T>() {
	let resolve: (value: T) => void = () => {};
	let reject: (reason: unknown) => void = () => {};
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

/** Whether a promise has settled yet, without waiting for it to. */
function track(promise: Promise<unknown> | undefined) {
	const state = { settled: false };
	promise?.then(
		() => (state.settled = true),
		() => (state.settled = true)
	);
	return state;
}

beforeEach(async () => {
	vi.resetModules();
	// Reset, not clear: a one-off answer queued by a test that never got to use
	// it would otherwise be handed to the next test that asks.
	vi.resetAllMocks();
	scope.listeners.clear();
	scope.preloadSupported = true;
	scope.offlinePlanCached = false;
	vi.stubGlobal('caches', cacheStorage);
	vi.stubGlobal('fetch', network);
	await import('./index');
});

describe('service worker — installation', () => {
	it('keeps the launch placeholder on disk with the shell', async () => {
		await fire('install');

		expect(addAll).toHaveBeenCalledWith(
			expect.arrayContaining(['/launch', '/offline-fallback.html'])
		);
	});
});

describe('service worker — activation', () => {
	it('drops the caches of earlier builds and takes over open pages', async () => {
		await fire('activate');

		expect(cacheStorage.delete).toHaveBeenCalledWith('trainara-old-build');
		expect(cacheStorage.delete).not.toHaveBeenCalledWith('trainara-test-build');
		expect(scope.claim).toHaveBeenCalled();
	});

	it('turns off the navigation preload an earlier worker turned on', async () => {
		// The setting outlives the worker that made it, so leaving it alone
		// would leave it on.
		await fire('activate');

		expect(scope.disablePreload).toHaveBeenCalled();
		expect(scope.enablePreload).not.toHaveBeenCalled();
	});

	it('still activates in a browser without navigation preload', async () => {
		scope.preloadSupported = false;

		await fire('activate');

		expect(scope.claim).toHaveBeenCalled();
	});
});

describe('service worker — navigations', () => {
	it('fetches the page itself', async () => {
		const page = new Response('dashboard');
		network.mockResolvedValue(page);

		const answer = await fire('fetch', navigation('/dashboard'));

		expect(answer).toBe(page);
		expect(network).toHaveBeenCalledTimes(1);
	});

	it('fetches the page itself even when a preload was sent', async () => {
		// Only possible in the moment before activation has turned preload off.
		// A preload belongs to the navigation it was sent for and cannot be
		// relied on to survive a hand-over, so the worker never answers with one.
		const page = new Response('dashboard');
		network.mockResolvedValue(page);

		const answer = await fire(
			'fetch',
			navigation('/dashboard', { preloadResponse: Promise.resolve(new Response('preloaded')) })
		);

		expect(answer).toBe(page);
	});

	it('shows the static offline page when there is no network and no offline calendar on disk', async () => {
		network.mockRejectedValue(new TypeError('Failed to fetch'));

		const answer = (await fire('fetch', navigation('/dashboard'))) as Response;

		expect(await answer.text()).toBe('offline page');
	});

	it('never answers a page from the cache while the network is up', async () => {
		network.mockResolvedValue(new Response('fresh'));

		await fire('fetch', navigation('/dashboard'));

		expect(cacheStorage.match).not.toHaveBeenCalled();
	});
});

/**
 * A dashboard slow to arrive: the launch placeholder stands in, and the
 * request already in flight is handed to the navigation it starts.
 *
 * The network here behaves as a slow one does — a response that has not
 * arrived yet, a body still streaming after its headers, a request that fails
 * part-way or never answers — rather than answering the moment it is asked.
 */
describe('service worker — a slow dashboard', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	/** A launch whose dashboard has not answered, carried past the point the placeholder stands in. */
	async function slowLaunch() {
		const page = deferred<Response>();
		network.mockReturnValueOnce(page.promise);
		const launch = dispatch('fetch', navigation('/dashboard'));
		await vi.advanceTimersByTimeAsync(300);
		return { page, launch, placeholder: (await launch.response) as Response };
	}

	/** The navigation the placeholder's meta refresh starts. */
	function handover() {
		return dispatch('fetch', navigation('/dashboard'));
	}

	it('shows nothing of its own while the dashboard may still answer in time', async () => {
		network.mockReturnValueOnce(new Promise(() => {}));
		const launch = dispatch('fetch', navigation('/dashboard'));
		const answered = track(launch.response);

		await vi.advanceTimersByTimeAsync(299);

		expect(answered.settled).toBe(false);
	});

	it('goes straight to a dashboard that answers in time, with no placeholder', async () => {
		const page = deferred<Response>();
		network.mockReturnValueOnce(page.promise);
		const launch = dispatch('fetch', navigation('/dashboard'));
		const dashboard = new Response('dashboard');

		await vi.advanceTimersByTimeAsync(200);
		page.resolve(dashboard);

		expect(await launch.response).toBe(dashboard);
		expect(cacheStorage.match).not.toHaveBeenCalled();
	});

	it('stands the placeholder in once the dashboard has gone 300ms without an answer', async () => {
		const { placeholder } = await slowLaunch();

		expect(await placeholder.text()).toBe('launch placeholder');
		expect(placeholder.headers.get('content-type')).toMatch(/^text\/html/);
	});

	it('gives the placeholder no URL of its own, so the window keeps the dashboard address', async () => {
		const { placeholder } = await slowLaunch();

		// A cached response carries the URL it was stored under (`/launch`); a
		// response with none takes the one the navigation asked for.
		expect(placeholder.url).toBe('');
		expect(placeholder.headers.get('etag')).toBeNull();
	});

	it('hands the request in flight to the placeholder’s navigation, without asking again', async () => {
		const { page } = await slowLaunch();
		const collected = handover();
		const dashboard = new Response('dashboard');

		page.resolve(dashboard);

		expect(await collected.response).toBe(dashboard);
		expect(network).toHaveBeenCalledTimes(1);
	});

	it('hands it over once: the next navigation asks the network afresh', async () => {
		const { page } = await slowLaunch();
		page.resolve(new Response('first'));
		await handover().response;

		const fresh = new Response('second');
		network.mockResolvedValueOnce(fresh);
		const next = dispatch('fetch', navigation('/dashboard'));

		expect(await next.response).toBe(fresh);
	});

	it('keeps the worker alive until the dashboard has arrived in full', async () => {
		const { page, launch } = await slowLaunch();
		const alive = track(launch.lifetime);
		let body: ReadableStreamDefaultController<Uint8Array> | undefined;
		const dashboard = new Response(new ReadableStream({ start: (c) => void (body = c) }));

		const collected = handover();
		page.resolve(dashboard);
		expect(await collected.response).toBe(dashboard);
		await vi.advanceTimersByTimeAsync(0);

		// Answered, but the body is still on its way through this worker.
		expect(alive.settled).toBe(false);

		body?.enqueue(new TextEncoder().encode('<html>'));
		body?.close();
		await vi.advanceTimersByTimeAsync(0);
		await dashboard.text();
		await vi.advanceTimersByTimeAsync(0);
		expect(alive.settled).toBe(true);
	});

	it('asks the network once more when the held request fails, before giving up', async () => {
		const { page } = await slowLaunch();
		const retried = new Response('dashboard, second try');
		network.mockResolvedValueOnce(retried);
		const collected = handover();

		page.reject(new TypeError('network connection was lost'));

		expect(await collected.response).toBe(retried);
		expect(network).toHaveBeenCalledTimes(2);
	});

	it('shows the offline page when the held request and the retry both fail', async () => {
		const { page } = await slowLaunch();
		network.mockRejectedValueOnce(new TypeError('Failed to fetch'));
		const collected = handover();

		page.reject(new TypeError('Failed to fetch'));

		expect(await ((await collected.response) as Response).text()).toBe('offline page');
	});

	it('stops waiting for a held request that never answers, and asks again', async () => {
		// The hang this ceiling exists for: the placeholder up for good, in an
		// app with no reload button. The server itself gives up at 15 seconds.
		await slowLaunch();
		const retried = new Response('dashboard, asked again');
		network.mockResolvedValueOnce(retried);
		const collected = handover();
		const answered = track(collected.response);

		await vi.advanceTimersByTimeAsync(19_000);
		expect(answered.settled).toBe(false);
		expect(network).toHaveBeenCalledTimes(1);

		await vi.advanceTimersByTimeAsync(1_000);
		expect(await collected.response).toBe(retried);
		expect(network).toHaveBeenCalledTimes(2);
	});

	it('asks again past the browser cache, so the stalled request cannot hold it back', async () => {
		await slowLaunch();
		network.mockResolvedValueOnce(new Response('dashboard, asked again'));
		const collected = handover();

		await vi.advanceTimersByTimeAsync(20_000);
		await collected.response;

		const [again] = network.mock.calls[1] as [Request];
		expect(again.url).toBe('https://trainara.test/dashboard');
		expect(again.cache).toBe('no-store');
	});

	it('counts the ceiling from when the request was sent, not from the hand-over', async () => {
		// Sent at 0, stood in for at 300, handed over at 5,300: the ceiling is
		// still at 20,000, not 25,300.
		await slowLaunch();
		await vi.advanceTimersByTimeAsync(5_000);
		network.mockResolvedValueOnce(new Response('asked again'));
		const collected = handover();
		const answered = track(collected.response);

		await vi.advanceTimersByTimeAsync(14_699);
		expect(answered.settled).toBe(false);

		await vi.advanceTimersByTimeAsync(1);
		expect(answered.settled).toBe(true);
	});

	it('lets go of a dashboard nobody collects', async () => {
		const { page } = await slowLaunch();

		await vi.advanceTimersByTimeAsync(10_000);

		// Later navigations are answered by their own request, not the stale one.
		const own = new Response('own');
		network.mockResolvedValueOnce(own);
		const later = dispatch('fetch', navigation('/dashboard'));
		page.resolve(new Response('stale'));
		expect(await later.response).toBe(own);
	});

	it('waits for the network, as before, when the placeholder is not on disk', async () => {
		cacheStorage.match.mockResolvedValueOnce(undefined);
		const page = deferred<Response>();
		network.mockReturnValueOnce(page.promise);
		const launch = dispatch('fetch', navigation('/dashboard'));
		const answered = track(launch.response);
		await vi.advanceTimersByTimeAsync(1_000);
		expect(answered.settled).toBe(false);

		const dashboard = new Response('dashboard');
		page.resolve(dashboard);

		expect(await launch.response).toBe(dashboard);
	});

	it.each([
		['another page', navigation('/goal')],
		['the dashboard with a query string', navigation('/dashboard?week=2')],
		['the dashboard inside a frame', navigation('/dashboard', { destination: 'iframe' })]
	])('never stands in for %s', async (_name, event) => {
		network.mockReturnValueOnce(new Promise(() => {}));
		const { response } = dispatch('fetch', event);
		const answered = track(response);

		await vi.advanceTimersByTimeAsync(1_000);

		expect(answered.settled).toBe(false);
		expect(cacheStorage.match).not.toHaveBeenCalled();
	});
});

describe('service worker — everything else', () => {
	it('serves the built shell from the cache', async () => {
		const cached = new Response('js');
		cacheStorage.match.mockResolvedValueOnce(cached);

		const answer = await fire('fetch', {
			request: {
				method: 'GET',
				url: 'https://trainara.test/_app/immutable/entry/start.js',
				mode: 'cors'
			}
		});

		expect(answer).toBe(cached);
	});

	it('leaves an API request alone', async () => {
		const answer = await fire('fetch', {
			request: { method: 'GET', url: 'https://trainara.test/api/v1/schedule', mode: 'cors' }
		});

		expect(answer).toBeUndefined();
		expect(network).not.toHaveBeenCalled();
	});

	it('leaves a POST alone', async () => {
		const answer = await fire('fetch', {
			request: { method: 'POST', url: 'https://trainara.test/logout', mode: 'navigate' }
		});

		expect(answer).toBeUndefined();
	});
});

describe('service worker — the offline calendar', () => {
	beforeEach(() => {
		scope.offlinePlanCached = true;
	});

	it('keeps the offline calendar on disk with the shell', async () => {
		await fire('install');

		expect(addAll).toHaveBeenCalledWith(
			expect.arrayContaining(['/offline', '/offline-fallback.html', '/launch'])
		);
	});

	it('sends a navigation with no network to the offline calendar', async () => {
		network.mockRejectedValue(new TypeError('Failed to fetch'));

		const answer = (await fire('fetch', navigation('/goal'))) as Response;

		expect(answer.status).toBe(302);
		expect(answer.headers.get('location')).toBe('https://trainara.test/offline');
	});

	it('sends a launch there too when the dashboard cannot be reached', async () => {
		network.mockRejectedValue(new TypeError('Failed to fetch'));

		const answer = (await fire('fetch', navigation('/dashboard'))) as Response;

		expect(answer.headers.get('location')).toBe('https://trainara.test/offline');
	});

	it('serves the offline calendar itself from disk', async () => {
		const answer = (await fire('fetch', navigation('/offline'))) as Response;

		expect(await answer.text()).toBe('offline calendar');
		expect(network).not.toHaveBeenCalled();
	});

	describe('behind the launch placeholder', () => {
		beforeEach(() => {
			vi.useFakeTimers();
		});

		afterEach(() => {
			vi.useRealTimers();
		});

		// The connection went while the placeholder was up: the held request and
		// the retry both fail, and the runner lands on the saved plan.
		it('sends the hand-over there when the held request and the retry both fail', async () => {
			const page = deferred<Response>();
			network.mockReturnValueOnce(page.promise);
			const launch = dispatch('fetch', navigation('/dashboard'));
			await vi.advanceTimersByTimeAsync(300);
			await launch.response;

			network.mockRejectedValueOnce(new TypeError('Failed to fetch'));
			const collected = dispatch('fetch', navigation('/dashboard'));
			page.reject(new TypeError('Failed to fetch'));

			const answer = (await collected.response) as Response;
			expect(answer.headers.get('location')).toBe('https://trainara.test/offline');
		});
	});
});
