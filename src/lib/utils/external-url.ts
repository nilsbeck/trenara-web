/**
 * A link from Trenara, made safe to put in an `href` that leaves the app.
 *
 * News items carry their link in `video_url`, typed by hand in Trenara's
 * admin, and an address written without its scheme — `youtu.be/abc`,
 * `www.instagram.com/reel/…` — is a *relative* URL to a browser. Put in an
 * `href` as it came, it resolved against the page it sat on, so "Open link"
 * on `/news` opened `/news/youtu.be/abc`: Trainara again, in a new tab,
 * instead of the video.
 *
 * So the address is read as an absolute web address whatever it looks like:
 *
 * - `https://…` and `http://…` are kept as they are;
 * - `//host/…` gets `https:`;
 * - anything else without a scheme is taken to start with a host name and
 *   gets `https://` in front, if that makes a URL with a dotted host;
 * - any other scheme (`javascript:`, `data:`, …), a blank string, and text
 *   that is no address at all give `null`, and no link is drawn.
 */
export function externalUrl(raw: string | null | undefined): string | null {
	const value = raw?.trim();
	if (!value) return null;

	const candidate = /^[a-z][a-z\d+.-]*:/i.test(value)
		? value
		: value.startsWith('//')
			? `https:${value}`
			: `https://${value.replace(/^\/+/, '')}`;

	let url: URL;
	try {
		url = new URL(candidate);
	} catch {
		return null;
	}
	if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
	// `https://Open%20here` parses; a host with no dot is not somewhere a
	// coach meant to send anyone.
	if (!url.hostname.includes('.')) return null;
	return url.href;
}
