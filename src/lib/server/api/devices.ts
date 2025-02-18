import type { Device } from './types';
import { apiClient } from './config';
import { getSessionTokenCookie } from '../auth';
import type { RequestEvent } from '@sveltejs/kit';
import { TokenType } from '../auth';

export const devicesApi = {
async registerDevice(event: RequestEvent, type: 'ios' | 'android' | 'web', token: string): Promise<Device> {
    const response = await apiClient.getAxios().post<Device>('/api/devices', { type, token });
    return response.data;
},

async getDevices(event: RequestEvent): Promise<Device[]> {
    const response = await apiClient.getAxios().get<Device[]>('/api/devices', {
        headers: {
            'Authorization': `Bearer ${getSessionTokenCookie(event, TokenType.AccessToken)}`,
            'X-API-Version': '1'
        }
    });
    return response.data;
},

async removeDevice(event: RequestEvent, deviceId: number): Promise<void> {
    await apiClient.getAxios().delete(`/api/devices/${deviceId}`);
},

async updateDevice(event: RequestEvent, deviceId: number, data: Partial<Device>): Promise<Device> {
    const response = await apiClient.getAxios().put<Device>(`/api/devices/${deviceId}`, data);
    return response.data;
}
};

