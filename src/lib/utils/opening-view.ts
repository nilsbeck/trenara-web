/**
 * Which view the calendar opens on — the folded week or the month — decided
 * where the page is rendered.
 *
 * The browser decides it with a media query (`calendar.svelte`): below `md`, a
 * phone, the week; above it, the month. The server has no viewport, so it used
 * to render the month for everyone and a phone folded it to a week once the
 * page had hydrated — a six-row grid collapsing to one row, and the session
 * underneath jumping up the screen, on every launch. The server cannot measure
 * the screen, so it is told: the browser remembers what its media query said
 * in a cookie, and the first visit, before there is a cookie, goes by what the
 * request says about the device.
 *
 * Only ever a hint. The media query still runs once the page is live and has
 * the last word, so a wrong guess costs the fold this exists to avoid and
 * nothing more.
 */

export type OpeningView = 'week' | 'month';

/** The cookie the browser leaves; read on the server, written in `calendar.svelte`. */
export const OPENING_VIEW_COOKIE = 'calendar-view';

/** A year: the cookie describes a device, which does not change from week to week. */
const MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

/**
 * Phones by their user agent, for the first visit only.
 *
 * Chromium sends `Sec-CH-UA-Mobile` on every request and that is checked
 * first; Safari and Firefox send no client hints, so their user agent is read
 * instead. An Android tablet says "Android" without "Mobile", and an iPad
 * claims to be a Mac, so both get the month — which is what their media query
 * will choose too.
 */
const PHONE_USER_AGENT = /\b(iPhone|iPod)\b|Android.+Mobile|Windows Phone/i;

/**
 * The view to render, from the remembered cookie or, failing that, the device.
 *
 * The cookie is the browser's own word and is trusted over the guess, but only
 * as one of the two values: anything else in it is ignored, never echoed.
 */
export function openingViewFor(remembered: string | undefined, headers: Headers): OpeningView {
	if (remembered === 'week' || remembered === 'month') return remembered;
	if (headers.get('sec-ch-ua-mobile') === '?1') return 'week';
	if (PHONE_USER_AGENT.test(headers.get('user-agent') ?? '')) return 'week';
	return 'month';
}

/**
 * The `document.cookie` assignment that remembers what the media query said.
 *
 * Not `HttpOnly`, because the browser writes it, and it carries nothing but a
 * layout preference — nothing about who the runner is (agents.md §7, Identity).
 * `Secure` wherever the page itself is, which is everywhere but local dev.
 */
export function openingViewCookie(view: OpeningView, secure: boolean): string {
	return `${OPENING_VIEW_COOKIE}=${view}; Path=/; Max-Age=${MAX_AGE_SECONDS}; SameSite=Lax${
		secure ? '; Secure' : ''
	}`;
}
