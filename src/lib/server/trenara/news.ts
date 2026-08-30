import type { Cookies } from '@sveltejs/kit';
import type { NewsResponse } from './types';
import { fetchClient } from './client';
import { expectCollections } from './shape';
import { TokenType } from '$lib/server/auth/types';

function bearerHeader(cookies: Cookies): Record<string, string> {
	return { Authorization: `Bearer ${cookies.get(TokenType.AccessToken)}` };
}

export const newsApi = {
	/**
	 * In-app news items — announcements, podcast episodes, events.
	 *
	 * Paginated ten to a page, newest first. The `page` parameter follows the
	 * same convention as the chat messages endpoint; only single-page responses
	 * have been observed, so treat `pagination.total_pages` as the source of
	 * truth rather than assuming a page exists.
	 */
	async getNews(cookies: Cookies, page = 1): Promise<NewsResponse> {
		return expectCollections<NewsResponse>(
			await fetchClient.get<unknown>('/api/news/', {
				headers: bearerHeader(cookies),
				cookies,
				params: { page }
			}),
			'/api/news/',
			['data']
		);
	}
};
