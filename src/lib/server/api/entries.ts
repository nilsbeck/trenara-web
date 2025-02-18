import type { Entry } from './types';
import { apiClient } from './config';
import type { RequestEvent } from '@sveltejs/kit';
export const entriesApi = {
async getEntries(event: RequestEvent, params?: { page?: number; per_page?: number }): Promise<Entry[]> {
    const response = await apiClient.getAxios().get<Entry[]>('/api/entries', { params });
    return response.data;
},

async getEntry(event: RequestEvent, id: number): Promise<Entry> {
    const response = await apiClient.getAxios().get<Entry>(`/api/entries/${id}`);
    return response.data;
},

async createEntry(event: RequestEvent, data: Omit<Entry, 'id'>): Promise<Entry> {
    const response = await apiClient.getAxios().post<Entry>('/api/entries', data);
    return response.data;
},

async updateEntry(event: RequestEvent, id: number, data: Partial<Entry>): Promise<Entry> {
    const response = await apiClient.getAxios().put<Entry>(`/api/entries/${id}`, data);
    return response.data;
},

async deleteEntry(event: RequestEvent, id: number): Promise<void> {
    await apiClient.getAxios().delete(`/api/entries/${id}`);
}
};

