/**
 * Auth API module - now using fetch instead of axios
 * Maintains identical interface and behavior
 */

import type { AuthResponse, LoginRequest, RefreshTokenRequest } from './types';
import { fetchClient } from './fetchClient';
import { BASIC_BEARER_TOKEN } from '$env/static/private';

if (!BASIC_BEARER_TOKEN) {
	console.error('BASIC_BEARER_TOKEN is not set');
}

export const authApi = {
	async login(data: LoginRequest): Promise<AuthResponse> {
		// OAuth token endpoint typically expects form data, not JSON
		const formData = new URLSearchParams();
		formData.append('grant_type', 'password');
		formData.append('username', data.username);
		formData.append('password', data.password);

		const response = await fetchClient.request<AuthResponse>(
			'/oauth/token',
			{
				method: 'POST',
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded',
					Authorization: `Basic ` + BASIC_BEARER_TOKEN
				},
				body: formData.toString()
			}
		);
		return response;
	},

	async refreshToken(data: RefreshTokenRequest): Promise<AuthResponse> {
		// OAuth token endpoint expects form data
		const formData = new URLSearchParams();
		formData.append('grant_type', 'refresh_token');
		formData.append('refresh_token', data.refresh_token);

		const response = await fetchClient.request<AuthResponse>(
			'/oauth/token',
			{
				method: 'POST',
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded'
				},
				body: formData.toString()
			}
		);
		return response;
	},

	async logout(): Promise<void> {
		await fetchClient.post<void>('/api/logout');
	},

	async resetPassword(email: string): Promise<void> {
		await fetchClient.post<void>('/api/password/reset', { email });
	}
};
