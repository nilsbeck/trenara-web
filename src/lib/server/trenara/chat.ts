import type { Cookies } from '@sveltejs/kit';
import type { ChatThread, ChatMessage, ChatMessagesResponse } from './types';
import { fetchClient } from './client';
import { expectArray } from './shape';
import { cachedRead, CacheKey, invalidate } from './read-cache';
import { TokenType } from '$lib/server/auth/types';

function bearerHeader(cookies: Cookies): Record<string, string> {
	return { Authorization: `Bearer ${cookies.get(TokenType.AccessToken)}` };
}

export const chatApi = {
	/**
	 * The reader's conversations.
	 *
	 * Cached, and it was the last hot read that was not. Three callers wanted
	 * it: `loadChatBadge` on every single page load, the bubble when it is
	 * opened, and the bubble's own tick while it is closed — so a runner with
	 * the app open was spending a request a minute on a thread list that
	 * changes when the coach writes back, which is a few times a week.
	 *
	 * Against a measured budget of sixty requests a minute for the whole app,
	 * that made this the largest single consumer. `sendMessage` drops it, so a
	 * conversation the runner just added to is never served from a copy taken
	 * before they wrote.
	 */
	async getThreads(cookies: Cookies, { fresh = false } = {}): Promise<ChatThread[]> {
		return cachedRead(
			cookies,
			CacheKey.threads,
			async () =>
				expectArray<ChatThread>(
					await fetchClient.get<unknown>('/api/threads/', {
						headers: bearerHeader(cookies),
						cookies
					}),
					'/api/threads/'
				),
			{ fresh }
		);
	},

	async getMessages(
		cookies: Cookies,
		threadId: number,
		page = 1,
		timestamp?: number
	): Promise<ChatMessagesResponse> {
		// Trenara requires timestamp (Unix seconds). Default to now so we get all messages up to this point.
		const params: Record<string, string | number> = {
			page,
			timestamp: timestamp ?? Math.floor(Date.now() / 1000)
		};

		return fetchClient.get<ChatMessagesResponse>(`/api/threads/${threadId}/messages`, {
			headers: bearerHeader(cookies),
			cookies,
			params
		});
	},

	/**
	 * Post a message to a thread.
	 *
	 * The field is `body`, matching the messages that come back. An earlier
	 * version sent `content`, which is what this app's own internal route uses
	 * but not what Trenara expects.
	 */
	async sendMessage(cookies: Cookies, threadId: number, content: string): Promise<ChatMessage> {
		const message = await fetchClient.post<ChatMessage>(
			`/api/threads/${threadId}/messages`,
			{ body: content },
			{ headers: bearerHeader(cookies), cookies }
		);

		// The thread list carries the last message and the unread count, both of
		// which this just changed.
		invalidate(cookies, CacheKey.threads);
		return message;
	}
};
