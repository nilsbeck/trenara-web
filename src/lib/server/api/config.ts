// src/lib/server/api/config.ts
import { error as svelteError } from '@sveltejs/kit';
import axios, { AxiosError, type AxiosInstance, type AxiosRequestConfig } from 'axios';
import type { ApiError } from './types';
const BASE_URL = 'https://backend-prod.trenara.com';

export class ApiClient {
    private axios: AxiosInstance;
    private static instance: ApiClient;

    private constructor() {
        this.axios = axios.create({
            baseURL: BASE_URL,
            headers: {
                'Content-Type': 'application/json'
            }
        });

        this.setupInterceptors();
    }

    public static getInstance(): ApiClient {
        if (!ApiClient.instance) {
            ApiClient.instance = new ApiClient();
        }
        return ApiClient.instance;
    }

    private setupInterceptors(): void {
        this.axios.interceptors.request.use(
            (config) => config,
            (error) => Promise.reject(error)
        );

        this.axios.interceptors.response.use(
            (response) => response,
            async (error: AxiosError<ApiError>) => {
                if (error.response?.status === 401) {
                    try {
                        // Try to refresh token using the refresh cookie that's automatically sent
                        await this.axios.post('/oauth/token', {
                            grant_type: 'refresh_token'
                        });
                        
                        // Retry original request - cookies will be sent automatically
                        const config = error.config as AxiosRequestConfig;
                        return this.axios(config);
                    } catch (refreshError) {
                        // In server context, throw a properly formatted error
                        throw svelteError(401, {
                            message: 'Unauthorized - Token refresh failed'
                        });
                    }
                }
                // For other errors, reject with the original error
                throw svelteError(error.response?.status || 500, {
                    message: error.response?.data?.message || 'An error occurred'
                });
            }
        );
    }

    public getAxios(): AxiosInstance {
        return this.axios;
    }
}

export const apiClient = ApiClient.getInstance();
