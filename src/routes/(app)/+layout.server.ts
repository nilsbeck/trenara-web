import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { configApi, userApi } from '$lib/server/trenara';
import { loadNewsBadge } from '$lib/server/news/badge';
import { loadChatBadge } from '$lib/server/chat/badge';

export const load: LayoutServerLoad = async ({ cookies, locals, depends }) => {
	if (!locals.user) {
		redirect(302, '/login');
	}

	// The news feed invalidates this once it has been read, so the badge clears
	// without a full page load.
	depends('app:news');

	/**
	 * The account behind the navbar's name and avatar.
	 *
	 * Awaited, unlike everything below it. It used to be streamed — returned as
	 * a promise, alongside the badges — and a streamed value is *always* pending
	 * first: the navbar rendered a spinner, then swapped in a name that had been
	 * the same all day. Every full page load, and every re-run of this load.
	 *
	 * There is nothing to stream for. It is a name and a picture, it is the same
	 * on every page, and since the read cache it is served from memory rather
	 * than fetched at all. Resolving it here puts it in the server-rendered HTML,
	 * which is the only way for it not to flicker.
	 *
	 * Null rather than a throw when it fails: the navbar is chrome on every page
	 * and must never be able to take one down. Consumers that need a real
	 * account — the profile page — say so themselves.
	 */
	const userData = await userApi.getCurrentUser(cookies).catch(() => null);

	/**
	 * The unread dot on the menu button, beside the avatar.
	 *
	 * Awaited for the same reason as the account: streamed, it was absent in the
	 * first paint and popped in a moment later, on the very button that had just
	 * stopped flickering. Two things settling at different times on one control
	 * is the flicker, whichever of them is late.
	 *
	 * Affordable because it is cached for ten minutes per reader — free on a
	 * warm cache, one request on a cold one. It reports its own failures as
	 * null, so awaiting it cannot fail a page either.
	 */
	const newsBadge = await loadNewsBadge(cookies, locals.user.id);

	/**
	 * The chat bubble's unread badge: the thread list plus how far the reader
	 * has got in each thread.
	 *
	 * Still streamed, unlike the two above, and deliberately. It calls
	 * `/api/threads/` uncached — a real request on every page's critical path if
	 * awaited — and it feeds a bubble that is collapsed until tapped, in the
	 * corner rather than in the navbar. Late is cheap there in a way it is not
	 * on the menu button.
	 */
	const chatBadge = loadChatBadge(cookies, locals.user.id);

	// Option lists and copy the pickers render from. Streamed like the badges,
	// and null on failure: every consumer falls back to the constants, so a
	// config the API would not serve is not a reason to fail a page.
	const appConfig = configApi.getAppConfig(cookies).catch(() => null);

	return {
		userData,
		newsBadge,
		chatBadge,
		appConfig
	};
};
