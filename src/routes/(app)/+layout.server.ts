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

	// Streamed, not awaited: the badge is an ornament on the navbar and must
	// never hold up the page behind it.
	const newsBadge = loadNewsBadge(cookies, locals.user.id);

	// Same for the chat bubble's unread badge: the thread list plus how far the
	// reader has got in each thread. It reports its own failures as "nothing
	// unread" — the page behind it has nothing to do with chat.
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
