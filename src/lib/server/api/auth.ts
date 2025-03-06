import type {
	AuthResponse,
	LoginRequest,
	RegisterRequest,
	RefreshTokenRequest,
	User
} from './types';
import { apiClient } from './config';

export const authApi = {
	async login(data: LoginRequest): Promise<AuthResponse> {
		const response = await apiClient.getAxios().post<AuthResponse>(
			'/oauth/token',
			{
				grant_type: 'password',
				username: data.username,
				password: data.password
			},
			{
				headers: {
					'Content-Type': 'application/json',
					Authorization: process.env.BASIC_BEARER_TOKEN
				}
			}
		);
		return response.data;
	},

	// async register(data: RegisterRequest): Promise<User> {
	//     const response = await apiClient.getAxios().post<User>('/api/register', data);
	//     return response.data;
	// },

	async refreshToken(data: RefreshTokenRequest): Promise<AuthResponse> {
		const response = await apiClient.getAxios().post<AuthResponse>('/oauth/token', {
			...data,
			grant_type: 'refresh_token'
		});
		return response.data;
	},

	async logout(): Promise<void> {
		await apiClient.getAxios().post('/api/logout');
	},

	async resetPassword(email: string): Promise<void> {
		await apiClient.getAxios().post('/api/password/reset', { email });
	}
};
