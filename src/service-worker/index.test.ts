import { describe, it, expect, vi, beforeEach } from 'vitest';

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
	claim: vi.fn(async () => undefined),
	skipWaiting: vi.fn(async () => undefined),
	preloadSupported: true
}));

vi.mock('$app/env', () => ({ version: 'test-build' }));
vi.mock('$app/manifest', () => ({
	immutable: [{ path: '_app/immutable/entry/start.js' }],
	assets: [{ path: 'offline.html' }, { path: 'logo.svg' }]
}));
vi.mock('$app/service-worker', () => ({
	self: {
		location: new URL('https://trainara.test/service-worker.js'),
		addEventListener: (type: string, listener: Listener) => scope.listeners.set(type, listener),
		skipWaiting: scope.skipWaiting,
		clients: { claim: scope.claim },
		get registration() {
			return scope.preloadSupported ? { navigationPreload: { enable: scope.enablePreload } } : {};
		}
	}
}));

const OFFLINE = new Response('offline page', { status: 200 });
const cacheStorage = {
	open: vi.fn(async () => ({ addAll: vi.fn(async () => undefined) })),
	keys: vi.fn(async () => ['trainara-old-build', 'trainara-test-build']),
	delete: vi.fn(async () => true),
	match: vi.fn(async (key: unknown) => (key === '/offline.html' ? OFFLINE.clone() : undefined))
};
const network = vi.fn<(request: unknown) => Promise<Response>>();

/** What `waitUntil` / `respondWith` were handed, once it settles. */
async function fire(type: string, fields: Record<string, unknown> = {}) {
	let pending: Promise<unknown> | undefined;
	const event = {
		...fields,
		waitUntil: (p: Promise<unknown>) => (pending = p),
		respondWith: (p: Promise<Response>) => (pending = p)
	};
	scope.listeners.get(type)?.(event);
	return pending === undefined ? undefined : await pending;
}

/** A page navigation as the browser hands it to the worker. */
function navigation(path: string, preloadResponse?: Promise<Response | undefined>) {
	return {
		request: { method: 'GET', url: `https://trainara.test${path}`, mode: 'navigate' },
		preloadResponse
	};
}

beforeEach(async () => {
	vi.resetModules();
	vi.clearAllMocks();
	scope.listeners.clear();
	scope.preloadSupported = true;
	vi.stubGlobal('caches', cacheStorage);
	vi.stubGlobal('fetch', network);
	await import('./index');
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
