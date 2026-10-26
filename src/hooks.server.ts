import { redirect } from '@sveltejs/kit';
import { sequence, type Handle, type HandleServerError } from '@sveltejs/kit/hooks';
import { TokenManager } from '#lib/server/auth/token-manager.js';
import { userApi } from '#lib/server/trenara/user.js';
import { isUpstreamFailure, describeFailure } from '#lib/server/trenara/request.js';
import { RateLimitError } from '#lib/server/trenara/client.js';
import { isDatabaseError, STORAGE_READ_MESSAGE } from '#lib/server/db/errors.js';
import { securityHeaders } from '#lib/server/security/headers.js';
import { apiRequests } from '#lib/server/security/rate-limit.js';

const tokenManager = TokenManager.getInstance();

// Once per cold start. Vercel shows only the runtime line ("22.x"), never the
// patch release, so this is the one place a deployment can be checked against
// a runtime advisory — CVE-2026-111497 was fixed in Node 22.23.4, with the
// bundled Brotli at 1.2.1.
console.info(`runtime node=${process.version} brotli=${process.versions.brotli ?? 'none'}`);

/**
 * Resolve who is asking, from the token and nothing else.
 *
 * There used to be a second source: a `user_id` cookie with an HMAC beside it,
 * so the id could be trusted without an API call. It was verified — but never
 * against the token it arrived with, so the two were checked independently and
 * nothing ever asked whether they described the same person. A signed pair was
 * therefore a permanent, transferable capability for that user's stored
 * history: valid forever, and valid alongside anybody's access token.
 *
 * The reason that shortcut existed is gone. `getCurrentUser` sits behind the
 * read cache now, keyed by the access token, holding the *promise* — so a warm
 * instance answers from memory and a cold one spends one request that every
 * concurrent caller shares. That is cheap enough to make the token the single
 * source of identity, which is the only way the two can never disagree.
 */
export const handleAuth: Handle = async ({ event, resolve }) => {
	event.locals.user = null;

	// Nothing to restore — an anonymous visitor, not an expired session.
	if (!tokenManager.hasSessionCookies(event.cookies)) {
		return resolve(event);
	}

	const status = await tokenManager.validateAndRefreshToken(event.cookies);

	if (status === 'invalid') {
		await tokenManager.logout(event.cookies);
		return resolve(event);
	}

	// The auth API was unreachable. The session is probably still fine, so the
	// cookies are left alone; this one request is just served unauthenticated.
	if (status === 'unavailable') {
		return resolve(event);
	}

	try {
		const user = await userApi.getCurrentUser(event.cookies);
		event.locals.user = { id: user.id, email: user.email };
	} catch {
		// The token was good enough to validate but the account could not be
		// read. That is Trenara being unreachable far more often than it is a
		// dead session, so the cookies are kept and this request is served
		// unauthenticated — same posture as `unavailable` above.
	}

	return resolve(event);
};

/** Routes that answer in JSON, and must be refused in JSON. */
function isApiRoute(routeId: string | null): boolean {
	return routeId?.startsWith('/api') ?? false;
}

/** Routes inside the authenticated shell, which redirect rather than refuse. */
function isAppRoute(routeId: string | null): boolean {
	return routeId?.startsWith('/(app)') ?? false;
}

/**
 * One gate, before any route runs.
 *
 * The guard used to be written out per route, and the copies disagreed: the
 * `(app)` layout redirected to the login screen while every page beneath it
 * threw a 401, and since layout and page loads run concurrently, which answer
 * an expired session got was a race. The dashboard had no copy at all, so an
 * unauthenticated request to the app's main page still opened five or six
 * upstream fetches before the layout's redirect settled.
 *
 * So the rule lives here once: a page redirects, an endpoint refuses, and
 * neither depends on a check being remembered.
 */
export const handleGuard: Handle = async ({ event, resolve }) => {
	const routeId = event.route.id;

	if (event.locals.user) {
		// A ceiling on what one account may ask of the API. Nothing else bounded
		// it, which left this app usable as a load generator pointed at Trenara —
		// whose own limit is sixty a minute for everyone behind this egress IP.
		if (isApiRoute(routeId)) {
			const limit = apiRequests.check(`api:${event.locals.user.id}`);
			if (!limit.allowed) {
				return new Response(JSON.stringify({ message: 'Too many requests' }), {
					status: 429,
					headers: {
						'content-type': 'application/json',
						'retry-after': String(limit.retryAfterSeconds)
					}
				});
			}
		}

		return resolve(event);
	}

	if (!(isApiRoute(routeId) || isAppRoute(routeId))) {
		return resolve(event);
	}

	if (isApiRoute(routeId)) {
		return new Response(JSON.stringify({ message: 'Unauthorized' }), {
			status: 401,
			headers: { 'content-type': 'application/json' }
		});
	}

	// Where they were headed, so signing in lands them there rather than on the
	// dashboard. Path and query only — never a caller-supplied absolute URL,
	// which is how a login redirect becomes an open redirect.
	const target = `${event.url.pathname}${event.url.search}`;
	redirect(302, target === '/dashboard' ? '/login' : `/login?next=${encodeURIComponent(target)}`);
};

/**
 * Order matters, and not in the order they read.
 *
 * `securityHeaders` goes *first* so that it wraps the other two rather than
 * following them. A hook in a `sequence` only reaches the ones after it by
 * calling `resolve`, and `handleGuard` deliberately does not: it returns a 401
 * outright. Placed last, the headers would therefore have been set on every
 * response except the refusals — the one class of response most likely to be
 * read by something other than a browser.
 *
 * The three are exported individually as well, because `sequence` reaches for
 * SvelteKit's request store and so cannot be driven outside a real request;
 * the tests compose them by hand.
 */
export const handle = sequence(securityHeaders, handleAuth, handleGuard);

/**
 * Last word on a failure nothing else caught.
 *
 * `passthrough` turns the upstream calls it wraps into proper statuses, but it
 * cannot cover a promise streamed to the browser or a call added later without
 * it — and whatever escapes lands here, where SvelteKit's own answer is the
 * word "Internal Error" and nothing in the log to say which server broke.
 *
 * So: a transport failure keeps its own description and is marked as such for
 * the error page, and everything else is logged with the route it came from.
 * The message shown to the runner stays generic — an unexpected error is by
 * definition one whose text was never meant for them.
 *
 * Since SvelteKit 3 this hook sees *every* error, not only unexpected ones:
 * an `error(400, …)` a route threw on purpose arrives as `kind: 'app'`, and a
 * 404 or 405 SvelteKit raised itself as `kind: 'framework'`. Both already
 * carry the status and the message the runner should see, so they are left
 * alone — returning nothing keeps them. Falling through to the branch at the
 * bottom would have logged every rejected body as a bug and replaced
 * Trenara's own refusal ("This training can no longer be moved") with an
 * apology for a fault that does not exist.
 */
export const handleError: HandleServerError = ({ kind, error, event }) => {
	if (kind !== 'unknown') return;

	// A storage failure that got past `fromStorage` — a DAO called somewhere
	// that does not wrap it yet. Reported as what it is rather than as a bug,
	// and never with the database's own words, which name columns.
	if (isDatabaseError(error)) {
		console.error(`[${event.request.method} ${event.url.pathname}] ${error.message}`);
		return { message: STORAGE_READ_MESSAGE, storage: true };
	}

	// A 429 that got past `passthrough` — a streamed promise, or a call added
	// without it. The snapshot is already in the log from the transport; this
	// carries it onto the page too, for the readers entitled to it.
	if (error instanceof RateLimitError) {
		const { message, rateLimit } = describeFailure(error, event.locals.user?.id);
		return { message, rateLimit };
	}

	if (isUpstreamFailure(error)) {
		console.error(`[${event.request.method} ${event.url.pathname}] upstream failure:`, error);
		return { message: describeFailure(error).message, unreachable: true };
	}

	console.error(`[${event.request.method} ${event.url.pathname}] unexpected error:`, error);

	return { message: 'Something went wrong on our side.' };
};
