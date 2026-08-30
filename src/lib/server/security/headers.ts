import { dev } from '$app/environment';
import type { Handle } from '@sveltejs/kit';

/**
 * The response headers the app was not sending.
 *
 * There was a Content-Security-Policy — a good one, in `svelte.config.js` —
 * and nothing else: no HSTS, no nosniff, no referrer policy. A CSP is the
 * hardest of these to get right and the app already had it, which is a strange
 * way round to be missing the three that are one line each.
 *
 * Each is here for a reason that applies to this app specifically, not because
 * a scanner asks for it:
 *
 * - **HSTS** because every request carries session cookies that are `secure`
 *   only outside dev; a first plaintext request is the one moment that flag
 *   cannot protect, and this closes it for every visit after the first.
 *   `preload` is deliberately not claimed — that is a submission the owner of
 *   the domain makes, not a header a deploy should assert on their behalf.
 * - **nosniff** because the API routes answer with JSON that includes text the
 *   upstream wrote, and a browser that decides for itself what a body is can
 *   turn that into a document.
 * - **Referrer-Policy** because the app's URLs carry training ids, and the
 *   default policy sends the whole path to any third-party origin a page
 *   reaches out to.
 * - **Permissions-Policy** to hand back the capabilities this app has no use
 *   for. It asks for none of them, so the list is simply everything it does
 *   not want a compromised script to be able to ask for either.
 *
 * Set here rather than in `svelte.config.js` because only the CSP is
 * configurable there, and only in a `handle` are they applied to API responses
 * as well as to pages.
 */
const HEADERS: Record<string, string> = {
	'x-content-type-options': 'nosniff',
	'referrer-policy': 'strict-origin-when-cross-origin',
	'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
	// The app is a single top-level document that opens nothing; isolating the
	// browsing context group costs it nothing and removes cross-origin
	// window references entirely.
	'cross-origin-opener-policy': 'same-origin'
};

/** Two years, which is what a preload list would require if one is ever wanted. */
const HSTS = 'max-age=63072000; includeSubDomains';

export const securityHeaders: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);

	for (const [name, value] of Object.entries(HEADERS)) {
		response.headers.set(name, value);
	}

	// Never in dev: an HSTS header on localhost pins the whole of localhost to
	// HTTPS in that browser profile, for every other project on the machine.
	if (!dev) {
		response.headers.set('strict-transport-security', HSTS);
	}

	return response;
};
