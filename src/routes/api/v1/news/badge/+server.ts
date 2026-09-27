import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { loadNewsBadge } from '$lib/server/news/badge';
import { requireUser } from '$lib/server/auth/guard';

/**
 * The unread-news badge, for a page that is already on screen.
 *
 * The layout load puts the badge in the first paint, but only if it is ready
 * within a fifth of a second, and it runs only on a full page load: a
 * client-side navigation does not re-run it, and neither does a PWA resumed
 * from the background. On a phone that is most of the time — the app is
 * opened from the home screen, often onto a cold instance that gives up on
 * the badge, and then used for days without a reload — so the dot never
 * appeared there. The navbar asks here instead, when it has no badge and
 * when the one it has is older than the server's cache of it.
 *
 * The same cached computation as the layout's, unbounded: nothing is waiting
 * on it. `badge` is null when the answer is not knowable, exactly as there.
 *
 * A GET that can write, once: a reader with no mark is seeded to the newest
 * item, as every page load already does. It only ever sets a mark nobody had,
 * so a cross-site request can cause nothing a visit to any page would not.
 */
export const GET: RequestHandler = async ({ cookies, locals }) => {
	const user = requireUser(locals);
	return json(
		{ badge: await loadNewsBadge(cookies, user.id) },
		{ headers: { 'cache-control': 'private, no-store' } }
	);
};
