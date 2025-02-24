import type { Notification } from './types';
import { apiClient } from './config';

export const notificationsApi = {
async getNotifications(page: number = 1): Promise<Notification[]> {
    const response = await apiClient.getAxios().get<Notification[]>(`/api/notifications/?page=${page}`);
    return response.data;
},


};

