import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { userApi } from '$lib/server/trenara';
import { loadNewsBadge } from '$lib/server/news/badge';
import { loadChatBadge } from '$lib/server/chat/badge';

export const load: LayoutServerLoad = async ({ cookies, locals, depends }) => {
	if (!locals.user) {
		redirect(302, '/login');
	}

	// The news feed invalidates this once it has been read, so the badge clears
	// without a full page load.
	depends('app:news');

	const userData = userApi.getCurrentUser(cookies);

	// Streamed, not awaited: the badge is an ornament on the navbar and must
	// never hold up the page behind it.
	const newsBadge = loadNewsBadge(cookies, locals.user.id);

	// Same for the chat bubble's unread badge: the thread list plus how far the
	// reader has got in each thread. It reports its own failures as "nothing
	// unread" — the page behind it has nothing to do with chat.
	const chatBadge = loadChatBadge(cookies, locals.user.id);

	return {
		userData,
		newsBadge,
		chatBadge
	};
};
