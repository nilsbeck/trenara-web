import type { User, Schedule, Subscription, UserPreferences } from './types';
import { apiClient } from './config';
import { getSessionTokenCookie, TokenType } from '../auth';
import type { RequestEvent } from '@sveltejs/kit';


export const userApi = {
async getCurrentUser(event: RequestEvent): Promise<User> {
    const response = await apiClient.getAxios().get<User>('/api/me', {
        headers: {
            'Authorization': `Bearer ${getSessionTokenCookie(event, TokenType.AccessToken)}`
        }
    });
    return response.data;
},

async updateProfile(event: RequestEvent, data: Partial<User>): Promise<User> {
    const response = await apiClient.getAxios().put<User>('/api/me', data);
    return response.data;
},

async deleteAccount(event: RequestEvent): Promise<void> {
    await apiClient.getAxios().delete('/api/user');
},

async updatePreferences(event: RequestEvent, preferences: Partial<UserPreferences>): Promise<User> {
const response = await apiClient.getAxios().put<User>('/api/user/preferences', preferences);
return response.data;
},

async getSubscription(event: RequestEvent): Promise<Subscription> {
const response = await apiClient.getAxios().get<Subscription>('/api/user/subscription');
return response.data;
},

async cancelSubscription(event: RequestEvent): Promise<void> {
await apiClient.getAxios().post('/api/user/subscription/cancel');
},

async getSchedule(event: RequestEvent, timestamp: number): Promise<Schedule> {
const response = await apiClient.getAxios().get<Schedule>(`/api/schedule/week/?timestamp=${timestamp}`, {
    headers: {
        'Authorization': `Bearer ${getSessionTokenCookie(event, TokenType.AccessToken)}`
    }
});
return response.data;
}
};
