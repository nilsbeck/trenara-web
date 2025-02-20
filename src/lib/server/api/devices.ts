import type { Device } from './types';
import { apiClient } from './config';
import type { Cookies } from '@sveltejs/kit';
import { getSessionTokenCookie, TokenType } from '../auth';

export const devicesApi = {
async registerDevice(cookies: Cookies, type: 'ios' | 'android' | 'web', token: string): Promise<Device> {
    const response = await apiClient.getAxios().post<Device>('/api/devices', { type, token });
    return response.data;
},

async getDevices(cookies: Cookies): Promise<Device[]> {
    const response = await apiClient.getAxios().get<Device[]>('/api/devices', {
        headers: {
            'Authorization': `Bearer ${getSessionTokenCookie(cookies, TokenType.AccessToken)}`,
            'X-API-Version': '1'
        }
    });
    return response.data;
},

async removeDevice(cookies: Cookies, deviceId: number): Promise<void> {
    await apiClient.getAxios().delete(`/api/devices/${deviceId}`, {
        headers: {
            'Authorization': `Bearer ${getSessionTokenCookie(cookies, TokenType.AccessToken)}`,
            'X-API-Version': '1'
        }
    });
},

async updateDevice(cookies: Cookies, deviceId: number, data: Partial<Device>): Promise<Device> {
    const response = await apiClient.getAxios().put<Device>(`/api/devices/${deviceId}`, data, {
        headers: {
            'Authorization': `Bearer ${getSessionTokenCookie(cookies, TokenType.AccessToken)}`,
            'X-API-Version': '1'
        }
    });
    return response.data;
}
};

