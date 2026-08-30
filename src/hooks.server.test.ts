import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Handle, RequestEvent } from '@sveltejs/kit';
import { securityHeaders } from '$lib/server/security/headers';

vi.mock('$app/environment', () => ({ dev: false }));

const { tokenState, userState } = vi.hoisted(() => ({
	tokenState: {
		hasCookies: true,
		status: 'valid' as 'valid' | 'refreshed' | 'invalid' | 'unavailable',
		loggedOut: false
	},
	userState: {
		user: { id: 42, email: 'runner@example.com' } as { id: number; email: string } | null
	}
}));

vi.mock('$lib/server/auth/token-manager', () => ({
	TokenManager: {
		getInstance: () => ({
			hasSessionCookies: () => tokenState.hasCookies,
			validateAndRefreshToken: async () => tokenState.status,
			logout: async () => {
				tokenState.loggedOut = true;
			}
		})
	}
}));

vi.mock('$lib/server/trenara/user', () => ({
	userApi: {
		getCurrentUser: async () => {
			if (!userState.user) throw new Error('unreachable');
			return userState.user;
		}
	}
}));

// The hooks are composed by hand rather than through the exported `handle`:
// `sequence` reads SvelteKit's request store, which only exists inside a real
// request. Chaining them here runs the same three in the same order.
let hooks: { handleAuth: Handle; handleGuard: Handle };

function compose(...chain: Handle[]): Handle {
	return chain.reduceRight<Handle>(
		(next, current) =>
			({ event, resolve }) =>
				current({ event, resolve: (e) => next({ event: e, resolve }) }),
		({ event, resolve }) => resolve(event)
	);
}

/** A request event with just the parts the hooks actually read. */
function eventFor(routeId: string | null, path = '/dashboard', search = ''): RequestEvent {
	return {
		route: { id: routeId },
		url: new URL(`https://trainara.test${path}${search}`),
		cookies: { get: () => undefined },
		locals: {},
		request: new Request(`https://trainara.test${path}${search}`)
	} as unknown as RequestEvent;
}

const ok = () => Promise.resolve(new Response('page', { status: 200 }));

/** Run the composed handle and hand back the response, or the thrown redirect. */
async function run(event: RequestEvent) {
	try {
		return { response: await handle({ event, resolve: ok }) };
	} catch (e) {
		return { thrown: e as { status: number; location: string } };
	}
}

let handle: Handle;

beforeEach(async () => {
	hooks = await import('./hooks.server');
	handle = compose(securityHeaders, hooks.handleAuth, hooks.handleGuard);
	tokenState.hasCookies = true;
	tokenState.status = 'valid';
	tokenState.loggedOut = false;
	userState.user = { id: 42, email: 'runner@example.com' };
});

describe('identity', () => {
	// The `user_id` cookie and its HMAC are gone. They were verified, but never
	// against the token beside them, so a signed pair was a permanent capability
	// for that user's stored history — valid alongside anybody's access token.
	it('resolves the runner from the token rather than from a cookie', async () => {
		const event = eventFor('/(app)/dashboard');

		await run(event);

		expect(event.locals.user).toEqual({ id: 42, email: 'runner@example.com' });
	});

	it('leaves an anonymous visitor anonymous without calling the API', async () => {
		tokenState.hasCookies = false;
		const event = eventFor('/login', '/login');

		await run(event);

		expect(event.locals.user).toBeNull();
	});

	it('clears the session when the tokens are refused for good', async () => {
		tokenState.status = 'invalid';
		const event = eventFor('/login', '/login');

		await run(event);

		expect(tokenState.loggedOut).toBe(true);
		expect(event.locals.user).toBeNull();
	});

	// Trenara being unreachable is not the runner's session ending. The cookies
	// are kept and this one request is served unauthenticated.
	it('keeps the session when the account could not be read', async () => {
		userState.user = null;
		const event = eventFor('/login', '/login');

		await run(event);

		expect(tokenState.loggedOut).toBe(false);
		expect(event.locals.user).toBeNull();
	});
});

describe('the guard', () => {
	// The layout used to redirect while every page beneath it threw a 401, and
	// they run concurrently — so which answer an expired session got was a race.
	it('redirects an unauthenticated visitor away from an app page', async () => {
		userState.user = null;
		const { thrown } = await run(eventFor('/(app)/goal', '/goal'));

		expect(thrown?.status).toBe(302);
		expect(thrown?.location).toBe('/login?next=%2Fgoal');
	});

	it('carries the query string through, so a deep link survives signing in', async () => {
		userState.user = null;
		const { thrown } = await run(eventFor('/(app)/news', '/news', '?page=3'));

		expect(thrown?.location).toBe('/login?next=%2Fnews%3Fpage%3D3');
	});

	// Landing on the dashboard is the default anyway; a `next` for it is noise.
	it('does not decorate the login URL when the destination is the default', async () => {
		userState.user = null;
		const { thrown } = await run(eventFor('/(app)/dashboard'));

		expect(thrown?.location).toBe('/login');
	});

	it('refuses an API route in JSON rather than redirecting it', async () => {
		userState.user = null;
		const { response } = await run(eventFor('/api/v1/schedule', '/api/v1/schedule'));

		expect(response?.status).toBe(401);
		expect(response?.headers.get('content-type')).toContain('application/json');
		await expect(response?.json()).resolves.toEqual({ message: 'Unauthorized' });
	});

	// The dashboard had no guard of its own, so an unauthenticated request still
	// opened five or six upstream fetches before the layout's redirect settled.
	it('stops the request before the route runs', async () => {
		userState.user = null;
		const resolve = vi.fn(ok);

		await Promise.resolve(handle({ event: eventFor('/(app)/dashboard'), resolve })).catch(() => {});

		expect(resolve).not.toHaveBeenCalled();
	});

	it('lets the login page through unauthenticated', async () => {
		userState.user = null;
		const { response } = await run(eventFor('/login', '/login'));

		expect(response?.status).toBe(200);
	});

	it('lets an authenticated runner through', async () => {
		const { response } = await run(eventFor('/(app)/dashboard'));

		expect(response?.status).toBe(200);
	});

	// Nothing bounded what one account could ask of the API, which left the app
	// usable as a load generator pointed at Trenara — whose own limit is sixty a
	// minute for everything behind this egress IP.
	it('caps how much API traffic one account can generate', async () => {
		const { apiRequests } = await import('$lib/server/security/rate-limit');
		apiRequests.reset();

		let last: Response | undefined;
		for (let i = 0; i < 241; i++) {
			({ response: last } = await run(eventFor('/api/v1/schedule', '/api/v1/schedule')));
		}

		expect(last?.status).toBe(429);
		expect(last?.headers.get('retry-after')).toMatch(/^\d+$/);
		apiRequests.reset();
	});

	it('does not cap page navigation, only the API', async () => {
		const { apiRequests } = await import('$lib/server/security/rate-limit');
		apiRequests.reset();

		let last: Response | undefined;
		for (let i = 0; i < 300; i++) {
			({ response: last } = await run(eventFor('/(app)/dashboard')));
		}

		expect(last?.status).toBe(200);
		apiRequests.reset();
	});
});

describe('security headers', () => {
	it('sets them on a page response', async () => {
		const { response } = await run(eventFor('/(app)/dashboard'));

		expect(response?.headers.get('x-content-type-options')).toBe('nosniff');
		expect(response?.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
		expect(response?.headers.get('strict-transport-security')).toContain('max-age=');
		expect(response?.headers.get('cross-origin-opener-policy')).toBe('same-origin');
	});

	// The guard returns its 401 outright rather than calling `resolve`, so the
	// header hook has to sit in front of it in the sequence, not behind. Put
	// last, it would have covered everything except the refusals.
	it('sets them on a refused API response as well', async () => {
		userState.user = null;
		const { response } = await run(eventFor('/api/v1/schedule', '/api/v1/schedule'));

		expect(response?.headers.get('x-content-type-options')).toBe('nosniff');
	});
});
