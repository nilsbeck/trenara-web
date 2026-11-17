import type { ScheduledTraining } from '#lib/server/trenara/types.js';

/** `#rgb`, `#rgba`, `#rrggbb` or `#rrggbbaa` — the forms CSS accepts, and nothing else. */
const HEX_COLOR = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/**
 * A colour from the upstream payload, if it is one.
 *
 * Trenara's session colour (`hex_training`) is written into `style`
 * attributes, and Svelte's escaping does nothing there about a `;` — a value
 * that was not a colour would add declarations of its own, one of which could
 * be a `background-image` fetching from any host the CSP's `img-src https:`
 * allows. Anything that is not a bare hex colour is refused, so a caller
 * draws its fallback instead.
 */
export function hexColor(value: string | null | undefined): string | null {
	const trimmed = value?.trim();
	return trimmed && HEX_COLOR.test(trimmed) ? trimmed : null;
}

/**
 * What a session is drawn in when it has no colour worth drawing: the theme's
 * muted grey, so the rail and tile stay in place without claiming a type.
 * A custom property rather than a hex value, so it follows the palette in
 * `app.css` and still works inside `color-mix`.
 */
export const NO_SESSION_COLOR = 'var(--color-muted-foreground)';

/** A session's own colour — per workout type, as the calendar paints it. */
export function trainingColor(training: Pick<ScheduledTraining, 'hex_training'>): string {
	return hexColor(training.hex_training) ?? NO_SESSION_COLOR;
}
