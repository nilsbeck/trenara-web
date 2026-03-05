import type { Cookies } from '@sveltejs/kit';
import type { ChatThread, ChatMessage, ChatMessagesResponse } from './types';
import { fetchClient } from './client';
import { TokenType } from '$lib/server/auth/types';

function bearerHeader(cookies: Cookies): Record<string, string> {
	return { Authorization: `Bearer ${cookies.get(TokenType.AccessToken)}` };
}

export const chatApi = {
	async getThreads(cookies: Cookies): Promise<ChatThread[]> {
		return fetchClient.get<ChatThread[]>('/api/threads/', {
			headers: bearerHeader(cookies),
			cookies
		});
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

	async sendMessage(cookies: Cookies, threadId: number, content: string): Promise<ChatMessage> {
		return fetchClient.post<ChatMessage>(
			`/api/threads/${threadId}/messages`,
			{ content },
			{ headers: bearerHeader(cookies), cookies }
		);
	}
};
