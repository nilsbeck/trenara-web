/**
 * Chat API module - handles chat threads and messages
 */

import { TokenType } from '../auth';
import { getSessionTokenCookie } from '../auth';
import { fetchClient } from './fetchClient';
import { ApiResponseError, handleError, logError } from '$lib/utils/error-handling';
import type { Cookies } from '@sveltejs/kit';

export interface ChatThread {
    id: number;
    type: string;
    title: string;
    sub_title: string;
    total_messages: number;
    unread_messages: number;
    can_send_messages: boolean;
    disabled: boolean;
    last_message?: {
        id: number;
        body: string;
        body_html: string;
        created_at: number;
        user_id: number;
        picture_url: string;
    };
}

export interface ChatMessage {
    id: number;
    body: string;
    body_html: string;
    created_at: number;
    user_id: number;
    picture_url?: string;
}

export interface ChatMessagesResponse {
    messages?: ChatMessage[];
    // The API might return messages directly as an array
    [key: string]: any;
}

export const chatApi = {
    async getThreads(cookies: Cookies): Promise<ChatThread[]> {
        try {
            const response = await fetchClient.get<ChatThread[]>(`/api/threads/`, {
                headers: {
                    Authorization: `Bearer ${getSessionTokenCookie(cookies, TokenType.AccessToken)}`
                },
                cookies
            });
            return response;
        } catch (error) {
            logError(error, 'getThreads');
            throw handleError(error);
        }
    },

    async createThread(cookies: Cookies): Promise<ChatThread> {
        try {
            const response = await fetchClient.post<ChatThread>(`/api/threads/`, {}, {
                headers: {
                    Authorization: `Bearer ${getSessionTokenCookie(cookies, TokenType.AccessToken)}`
                },
                cookies
            });
            return response;
        } catch (error) {
            logError(error, 'createThread');
            throw handleError(error);
        }
    },

    async getMessages(
        cookies: Cookies, 
        threadId: number, 
        page: number = 1, 
        timestamp?: number
    ): Promise<ChatMessagesResponse> {
        try {
            const params: Record<string, string> = {
                page: page.toString()
            };
            
            if (timestamp) {
                params.timestamp = timestamp.toString();
            }

            const response = await fetchClient.get<ChatMessagesResponse>(
                `/api/threads/${threadId}/messages`, 
                {
                    headers: {
                        Authorization: `Bearer ${getSessionTokenCookie(cookies, TokenType.AccessToken)}`
                    },
                    cookies,
                    params
                }
            );
            return response;
        } catch (error) {
            logError(error, 'getMessages');
            throw handleError(error);
        }
    },

    async sendMessage(
        cookies: Cookies, 
        threadId: number, 
        content: string
    ): Promise<ChatMessage> {
        try {
            const response = await fetchClient.post<ChatMessage>(
                `/api/threads/${threadId}/messages`,
                { content },
                {
                    headers: {
                        Authorization: `Bearer ${getSessionTokenCookie(cookies, TokenType.AccessToken)}`
                    },
                    cookies
                }
            );
            return response;
        } catch (error) {
            logError(error, 'sendMessage');
            throw handleError(error);
        }
    }
};
