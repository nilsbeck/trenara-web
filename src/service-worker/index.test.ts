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
	preloadSupported: true
}));

vi.mock('$app/env', () => ({ version: 'test-build' }));
vi.mock('$app/manifest', () => ({
	immutable: [{ path: '_app/immutable/entry/start.js' }],
	assets: [{ path: 'offline.html' }, { path: 'logo.svg' }],
	prerendered: [{ path: 'launch' }]
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
const PLACEHOLDER = new Response('launch placeholder', {
	status: 200,
	headers: { 'content-type': 'text/html', etag: '"build"' }
});
const addAll = vi.fn(async (_files: string[]) => undefined);
const cacheStorage = {
	open: vi.fn(async () => ({ addAll })),
	keys: vi.fn(async () => ['trainara-old-build', 'trainara-test-build']),
	delete: vi.fn(async () => true),
	match: vi.fn(async (key: unknown) =>
		key === '/offline.html' ? OFFLINE.clone() : key === '/launch' ? PLACEHOLDER.clone() : undefined
	)
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

/** A page navigation as the browser hands it to the worker: a window's own page. */
function navigation(
	path: string,
	preloadResponse?: Promise<Response | undefined>,
	destination = 'document'
) {
	return {
		request: { method: 'GET', url: `https://trainara.test${path}`, mode: 'navigate', destination },
		preloadResponse
	};
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
	vi.stubGlobal('caches', cacheStorage);
	vi.stubGlobal('fetch', network);
	await import('./index');
});

describe('service worker — installation', () => {
	it('keeps the launch placeholder on disk with the shell', async () => {
		await fire('install');

		expect(addAll).toHaveBeenCalledWith(expect.arrayContaining(['/launch', '/offline.html']));
	});
});

describe('service worker — activation', () => {
	it('drops the caches of earlier builds and takes over open pages', async () => {
		await fire('activate');

		expect(cacheStorage.delete).toHaveBeenCalledWith('trainara-old-build');
		expect(cacheStorage.delete).not.toHaveBeenCalledWith('trainara-test-build');
		expect(scope.claim).toHaveBeenCalled();
	});

	it('turns on navigation preload', async () => {
		await fire('activate');

		expect(scope.enablePreload).toHaveBeenCalled();
	});

	it('still activates in a browser without navigation preload', async () => {
		scope.preloadSupported = false;

		await fire('activate');

		expect(scope.claim).toHaveBeenCalled();
	});
});

describe('service worker — navigations', () => {
	/**
	 * With a fetch handler installed, the browser has to start this worker
	 * before a navigation can even be sent. Navigation preload sends it in
	 * parallel with that start-up, and the worker must then answer with the
	 * response already in flight rather than ask the network a second time.
	 */
	it('answers with the preloaded response, without fetching again', async () => {
		const page = new Response('dashboard');

		const answer = await fire('fetch', navigation('/dashboard', Promise.resolve(page)));

		expect(answer).toBe(page);
		expect(network).not.toHaveBeenCalled();
	});

	it('fetches the page itself when nothing was preloaded', async () => {
		const page = new Response('dashboard');
		network.mockResolvedValue(page);

		const answer = await fire('fetch', navigation('/dashboard', Promise.resolve(undefined)));

		expect(answer).toBe(page);
		expect(network).toHaveBeenCalledTimes(1);
	});

	it('fetches the page itself in a browser that has no preload at all', async () => {
		const page = new Response('dashboard');
		network.mockResolvedValue(page);

		const answer = await fire('fetch', navigation('/dashboard'));

		expect(answer).toBe(page);
	});

	it('shows the offline page when there is no network', async () => {
		network.mockRejectedValue(new TypeError('Failed to fetch'));

		const answer = (await fire(
			'fetch',
			navigation('/dashboard', Promise.reject(new TypeError('Failed to fetch')))
		)) as Response;

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
 * part-way — rather than answering the moment it is asked.
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
		const launch = dispatch('fetch', navigation('/dashboard', page.promise));
		await vi.advanceTimersByTimeAsync(300);
		return { page, launch, placeholder: (await launch.response) as Response };
	}

	/** The navigation the placeholder's meta refresh starts, with preload off. */
	function handover() {
		return dispatch('fetch', navigation('/dashboard', Promise.resolve(undefined)));
	}

	it('shows nothing of its own while the dashboard may still answer in time', async () => {
		const page = deferred<Response>();
		const launch = dispatch('fetch', navigation('/dashboard', page.promise));
		const answered = track(launch.response);

		await vi.advanceTimersByTimeAsync(299);

		expect(answered.settled).toBe(false);
	});

	it('goes straight to a dashboard that answers in time, with no placeholder', async () => {
		const page = deferred<Response>();
		const launch = dispatch('fetch', navigation('/dashboard', page.promise));
		const dashboard = new Response('dashboard');

		await vi.advanceTimersByTimeAsync(200);
		page.resolve(dashboard);

		expect(await launch.response).toBe(dashboard);
		expect(cacheStorage.match).not.toHaveBeenCalled();
		expect(scope.disablePreload).not.toHaveBeenCalled();
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
		expect(network).not.toHaveBeenCalled();
	});

	it('hands it over once: the next navigation asks the network afresh', async () => {
		const { page } = await slowLaunch();
		page.resolve(new Response('first'));
		await handover().response;

		const fresh = new Response('second');
		const next = dispatch('fetch', navigation('/dashboard', Promise.resolve(fresh)));

		expect(await next.response).toBe(fresh);
	});

	it('turns navigation preload off before the placeholder is shown', async () => {
		// Shown first, the placeholder's navigation could leave with a preload of
		// its own: a second request for the whole dashboard, thrown away unread.
		const turningOff = deferred<void>();
		scope.disablePreload.mockReturnValueOnce(turningOff.promise);
		const page = deferred<Response>();
		const launch = dispatch('fetch', navigation('/dashboard', page.promise));
		const answered = track(launch.response);

		await vi.advanceTimersByTimeAsync(300);
		expect(scope.disablePreload).toHaveBeenCalled();
		expect(answered.settled).toBe(false);

		turningOff.resolve();
		await vi.advanceTimersByTimeAsync(0);
		expect(answered.settled).toBe(true);
	});

	it('turns navigation preload back on once the dashboard is collected', async () => {
		const { page } = await slowLaunch();
		expect(scope.enablePreload).not.toHaveBeenCalled();

		handover();
		await vi.advanceTimersByTimeAsync(0);

		expect(scope.enablePreload).toHaveBeenCalledTimes(1);
		page.resolve(new Response('dashboard'));
	});

	it('still stands in where turning preload off is refused', async () => {
		scope.disablePreload.mockRejectedValueOnce(new Error('InvalidStateError'));

		const { placeholder } = await slowLaunch();

		expect(await placeholder.text()).toBe('launch placeholder');
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
		expect(network).toHaveBeenCalledTimes(1);
	});

	it('shows the offline page when the held request and the retry both fail', async () => {
		const { page } = await slowLaunch();
		network.mockRejectedValueOnce(new TypeError('Failed to fetch'));
		const collected = handover();

		page.reject(new TypeError('Failed to fetch'));

		expect(await ((await collected.response) as Response).text()).toBe('offline page');
	});

	it('lets go of a dashboard nobody collects, and turns preload back on', async () => {
		const { page } = await slowLaunch();

		await vi.advanceTimersByTimeAsync(10_000);
		expect(scope.enablePreload).toHaveBeenCalledTimes(1);

		// Later navigations are answered by their own request, not the stale one.
		const own = new Response('own');
		const later = dispatch('fetch', navigation('/dashboard', Promise.resolve(own)));
		page.resolve(new Response('stale'));
		expect(await later.response).toBe(own);
	});

	it('waits for the network, as before, when the placeholder is not on disk', async () => {
		cacheStorage.match.mockResolvedValueOnce(undefined);
		const page = deferred<Response>();
		const launch = dispatch('fetch', navigation('/dashboard', page.promise));
		const answered = track(launch.response);
		await vi.advanceTimersByTimeAsync(1_000);
		expect(answered.settled).toBe(false);

		const dashboard = new Response('dashboard');
		page.resolve(dashboard);

		expect(await launch.response).toBe(dashboard);
		expect(scope.disablePreload).not.toHaveBeenCalled();
	});

	it.each([
		['another page', navigation('/goal', new Promise(() => {}))],
		['the dashboard with a query string', navigation('/dashboard?week=2', new Promise(() => {}))],
		['the dashboard inside a frame', navigation('/dashboard', new Promise(() => {}), 'iframe')]
	])('never stands in for %s', async (_name, event) => {
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
