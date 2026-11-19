/** Stands in for the app's own origin; reserved by RFC 2606, so it can never be a real one. */
const HERE = 'https://next.invalid';

/** Where a sign-in lands when there is nowhere safe to go back to. */
const FALLBACK = '/dashboard';

/**
 * Where to send someone after they sign in.
 *
 * Only a path on this app, never a caller-supplied absolute URL: `next` comes
 * from the query string, and a login form that will redirect anywhere is an
 * open redirect wearing a helpful face.
 *
 * It used to be a prefix check — starts with `/`, not with `//` — and that is
 * the check every open-redirect write-up shows being walked past. A browser
 * reads a backslash in a URL as a slash and drops tabs and newlines from it
 * altogether, so `/\evil.example` and `/<tab>/evil.example` both begin with a
 * single slash, pass the test, and are `//evil.example` by the time the
 * `Location` header is followed. The login `load` redirects a signed-in
 * visitor straight to `next`, so `/login?next=/%5Cevil.example` sent anybody
 * who clicked it off-site without a form in between.
 *
 * So the value is resolved the way the browser will resolve it, by the same
 * WHATWG parser, and kept only if it is still on this origin. What comes back
 * is the parsed path rather than the raw string: the two can only differ in
 * ways that the browser would have normalised anyway.
 */
export function safeNext(raw: string | null | undefined): string {
	if (!raw || !raw.startsWith('/')) return FALLBACK;

	let url: URL;
	try {
		url = new URL(raw, HERE);
	} catch {
		return FALLBACK;
	}

	if (url.origin !== HERE) return FALLBACK;
	return `${url.pathname}${url.search}${url.hash}`;
}
