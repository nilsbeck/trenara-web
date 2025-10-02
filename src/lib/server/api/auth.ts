/**
 * Auth API module - now using fetch instead of axios
 * Maintains identical interface and behavior
 */

import type {
    AuthResponse,
    LoginRequest,
    RefreshTokenRequest
} from './types';
import { fetchClient } from './fetchClient';
import dotenv from 'dotenv';
dotenv.config();

if (!process.env.BASIC_BEARER_TOKEN) {
    console.error('BASIC_BEARER_TOKEN is not set');
}

export const authApi = {
    async login(data: LoginRequest): Promise<AuthResponse> {
        const response = await fetchClient.post<AuthResponse>(
            '/oauth/token',
            {
                grant_type: 'password',
                username: data.username,
                password: data.password
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Basic ` + process.env.BASIC_BEARER_TOKEN
                }
            }
        );
        return response;
    },

    async refreshToken(data: RefreshTokenRequest): Promise<AuthResponse> {
        const response = await fetchClient.post<AuthResponse>('/oauth/token', {
            ...data,
            grant_type: 'refresh_token'
        });
        return response;
    },

    async logout(): Promise<void> {
        await fetchClient.post<void>('/api/logout');
    },

    async resetPassword(email: string): Promise<void> {
        await fetchClient.post<void>('/api/password/reset', { email });
    }
};
