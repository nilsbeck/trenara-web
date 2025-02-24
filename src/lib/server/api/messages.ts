import type { Message, Thread } from './types';
import { apiClient } from './config';

export const messagesApi = {
	async getThreads(): Promise<Thread[]> {
		const response = await apiClient.getAxios().get<Thread[]>('/api/threads');
		return response.data;
	},

	// async getThread(threadId: number): Promise<Thread> {
	//     const response = await apiClient.getAxios().get<Thread>(`/api/threads/${threadId}`);
	//     return response.data;
	// },

	async getMessages(threadId: number, page: number = 1, timestamp: number): Promise<Message[]> {
		const response = await apiClient
			.getAxios()
			.get<Message[]>(`/api/threads/${threadId}/messages`, {
				params: {
					page,
					timestamp
				}
			});
		return response.data;
	},

	async sendMessage(threadId: number, content: string): Promise<Message> {
		const response = await apiClient
			.getAxios()
			.post<Message>(`/api/threads/${threadId}/messages`, { content });
		return response.data;
	},

	async markAsRead(threadId: number): Promise<void> {
		await apiClient.getAxios().post(`/api/threads/${threadId}/read`);
	}
};
