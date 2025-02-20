import type { Entry } from './types';
import { apiClient } from './config';
import type { Cookies } from '@sveltejs/kit';
import { getSessionTokenCookie, TokenType } from '../auth';

export const entriesApi = {
async getEntries(cookies: Cookies, params?: { page?: number; per_page?: number }): Promise<Entry[]> {
    const response = await apiClient.getAxios().get<Entry[]>('/api/entries', { params });
    return response.data;
},

async getEntry(cookies: Cookies, id: number): Promise<Entry> {
    const response = await apiClient.getAxios().get<Entry>(`/api/entries/${id}`, {
        headers: {
            'Authorization': `Bearer ${getSessionTokenCookie(cookies, TokenType.AccessToken)}`
        }
    });
    return response.data;
},

async createEntry(cookies: Cookies, data: Omit<Entry, 'id'>): Promise<Entry> {
    const response = await apiClient.getAxios().post<Entry>('/api/entries', data, {
        headers: {
            'Authorization': `Bearer ${getSessionTokenCookie(cookies, TokenType.AccessToken)}`
        }
    });
    return response.data;
},

async updateEntry(cookies: Cookies, id: number, data: Partial<Entry>): Promise<Entry> {
    const response = await apiClient.getAxios().put<Entry>(`/api/entries/${id}`, data, {
        headers: {
            'Authorization': `Bearer ${getSessionTokenCookie(cookies, TokenType.AccessToken)}`
        }
    });
    return response.data;
},

async deleteEntry(cookies: Cookies, id: number): Promise<void> {
    await apiClient.getAxios().delete(`/api/entries/${id}`, {
        headers: {
            'Authorization': `Bearer ${getSessionTokenCookie(cookies, TokenType.AccessToken)}`
        }
    });
}
};

