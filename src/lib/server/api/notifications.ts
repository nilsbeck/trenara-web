import type { Notification } from './types';
import { apiClient } from './config';

export const notificationsApi = {
async getNotifications(): Promise<Notification[]> {
    const response = await apiClient.getAxios().get<Notification[]>('/api/notifications');
    return response.data;
},

async markAsRead(notificationId: number): Promise<void> {
    await apiClient.getAxios().post(`/api/notifications/${notificationId}/read`);
},

async markAllAsRead(): Promise<void> {
    await apiClient.getAxios().post('/api/notifications/read-all');
},

async updatePreferences(preferences: { email: boolean; push: boolean }): Promise<void> {
    await apiClient.getAxios().put('/api/notifications/preferences', preferences);
}
};

