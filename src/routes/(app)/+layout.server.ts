import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { chatApi, userApi } from '$lib/server/trenara';
import { loadNewsBadge } from '$lib/server/news/badge';

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

	// Same for the chat bubble's unread badge. A chat that cannot be reached is
	// an empty thread list here — the bubble reports its own errors once opened,
	// and the page behind it has nothing to do with chat.
	const chatThreads = chatApi.getThreads(cookies).catch(() => []);

	return {
		userData,
		newsBadge,
		chatThreads
	};
};
