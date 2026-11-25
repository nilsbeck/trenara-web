/**
 * The launch placeholder is built once, when the app is built, and is the same
 * file for everyone — there is nothing on it but the frame of the app.
 *
 * Prerendered so that it is a file: the service worker keeps it from install
 * and can show it with no answer from the network at all, which is the only
 * moment it is for (see `src/service-worker/index.ts`).
 *
 * No JavaScript (`csr = false`). It is on screen only for the seconds before
 * the dashboard arrives, and leaves by a meta refresh; hydrating it would
 * spend those seconds starting a router whose one job would be to leave.
 */
export const prerender = true;
export const csr = false;
