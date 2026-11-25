/**
 * Built once, at build time, and served as a static file.
 *
 * This page is what the service worker shows for a navigation that cannot
 * reach the network, so it has to be on the device before it is needed: the
 * worker precaches every prerendered page alongside the built JS and CSS.
 * There is nothing for a server to render here anyway — no load, no cookie,
 * no runner — because the plan it shows comes out of this browser's own
 * storage once the page is running (`#lib/utils/offline-plan`).
 */
export const prerender = true;
