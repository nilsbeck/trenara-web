/**
 * Where a link to another site should open.
 *
 * In a browser tab, a new tab: following the link in the same one would leave
 * the app. In the installed app it is the other way round. On Android a
 * `target="_blank"` link from a home-screen app does not reach the page it
 * names — the "Open link" under a news item brought the runner straight back
 * into Trainara instead of the video. A plain navigation to a URL outside the
 * app's scope is what both Android and iOS handle properly there: they open it
 * in an in-app browser sheet over the app, with a close button back to where
 * the runner was, so the app is not left at all.
 *
 * Returns `undefined` rather than `'_self'` so the attribute is simply absent.
 */
export function externalLinkTarget(): '_blank' | undefined {
	return isInstalledApp() ? undefined : '_blank';
}

/** Whether the page is running as the installed, home-screen app. */
export function isInstalledApp(): boolean {
	if (typeof window === 'undefined') return false;
	// iOS Safari never reported the display mode through `matchMedia`; it has
	// its own flag instead.
	if ((navigator as Navigator & { standalone?: boolean }).standalone === true) return true;
	if (typeof window.matchMedia !== 'function') return false;
	return window.matchMedia('(display-mode: standalone)').matches;
}
