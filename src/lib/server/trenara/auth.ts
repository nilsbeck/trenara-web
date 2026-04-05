import type { AuthResponse, LoginRequest, RefreshTokenRequest } from './types';
import { fetchClient } from './client';
import { BASIC_BEARER_TOKEN } from '$env/static/private';

export const authApi = {
	async login(data: LoginRequest): Promise<AuthResponse> {
		const formData = new URLSearchParams();
		formData.append('grant_type', 'password');
		formData.append('username', data.username);
		formData.append('password', data.password);

		return fetchClient.request<AuthResponse>('/oauth/token', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
				Authorization: `Basic ${BASIC_BEARER_TOKEN}`
			},
			body: formData.toString()
		});
	},

	async refreshToken(data: RefreshTokenRequest): Promise<AuthResponse> {
		const formData = new URLSearchParams();
		formData.append('grant_type', 'refresh_token');
		formData.append('refresh_token', data.refresh_token);

		return fetchClient.request<AuthResponse>('/oauth/token', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
				Authorization: `Basic ${BASIC_BEARER_TOKEN}`
			},
			body: formData.toString()
		});
	}
};
