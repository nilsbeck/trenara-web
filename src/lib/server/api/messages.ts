/**
 * Messages API module - now using fetch instead of axios
 * Maintains identical interface and behavior
 */

import type { Thread, Message } from './types';
import { fetchClient } from './fetchClient';

export const messagesApi = {
    async getThreads(): Promise<Thread[]> {
        const response = await fetchClient.get<Thread[]>('/api/threads');
        return response;
    },

    async getMessages(threadId: number, page: number = 1, timestamp: number): Promise<Message[]> {
        const response = await fetchClient.get<Message[]>(
            `/api/threads/${threadId}/messages`,
            {
                params: {
                    page,
                    timestamp
                }
            }
        );
        return response;
    },

    async sendMessage(threadId: number, content: string): Promise<Message> {
        const response = await fetchClient.post<Message>(
            `/api/threads/${threadId}/messages`, 
            { content }
        );
        return response;
    },

    async markAsRead(threadId: number): Promise<void> {
        await fetchClient.post<void>(`/api/threads/${threadId}/read`);
    }
};
