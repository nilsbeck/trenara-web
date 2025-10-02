/**
 * FetchClient - Native fetch-based HTTP client to replace axios
 * Maintains identical functionality including automatic token refresh
 */

import { error as svelteError } from '@sveltejs/kit';
import type { Cookies } from '@sveltejs/kit';

const BASE_URL = 'https://backend-prod.trenara.com';

export interface RequestOptions {
    headers?: Record<string, string>;
    cookies?: Cookies; // For server-side requests
    timeout?: number;
    retries?: number;
    signal?: AbortSignal;
    params?: Record<string, string | number | boolean>;
}

export interface FetchResponse<T> {
    data: T;
    status: number;
    statusText: string;
    headers: Headers;
}

export interface ApiError {
    message: string;
    status: number;
    code?: string;
    details?: Record<string, string[]>;
}

export type RequestInterceptor = (
    url: string, 
    options: RequestInit
) => Promise<{ url: string; options: RequestInit }> | { url: string; options: RequestInit };

export type ResponseInterceptor = <T>(
    response: Response, 
    data: T
) => Promise<T> | T;

export type ErrorInterceptor = (error: Error) => Promise<Error> | Error;

export interface RequestOptions {
    headers?: Record<string, string>;
    cookies?: Cookies; // For server-side requests
    timeout?: number;
    retries?: number;
    signal?: AbortSignal;
}

export interface FetchResponse<T> {
    data: T;
    status: number;
    statusText: string;
    headers: Headers;
}

export interface ApiError {
    message: string;
    status: number;
    code?: string;
    details?: Record<string, string[]>;
}

export class NetworkError extends Error {
    constructor(message: string, public originalError?: Error) {
        super(message);
        this.name = 'NetworkError';
    }
}

export class HttpError extends Error {
    constructor(
        message: string,
        public status: number,
        public response?: Response,
        public data?: any
    ) {
        super(message);
        this.name = 'HttpError';
    }
}

export class AuthenticationError extends HttpError {
    constructor(message: string, response?: Response, data?: any) {
        super(message, 401, response, data);
        this.name = 'AuthenticationError';
    }
}

export class AuthorizationError extends HttpError {
    constructor(message: string, response?: Response, data?: any) {
        super(message, 403, response, data);
        this.name = 'AuthorizationError';
    }
}

export class ValidationError extends HttpError {
    constructor(message: string, public details?: Record<string, string[]>, response?: Response, data?: any) {
        super(message, 400, response, data);
        this.name = 'ValidationError';
    }
}

export class ServerError extends HttpError {
    constructor(message: string, status: number, response?: Response, data?: any) {
        super(message, status, response, data);
        this.name = 'ServerError';
    }
}

export class TimeoutError extends Error {
    constructor(message: string = 'Request timeout') {
        super(message);
        this.name = 'TimeoutError';
    }
}



export class FetchClient {
    private static instance: FetchClient;
    private baseURL: string;
    private defaultHeaders: Record<string, string>;
    private isRefreshing: boolean = false;
    private refreshPromise: Promise<boolean> | null = null;
    private requestInterceptors: RequestInterceptor[] = [];
    private responseInterceptors: ResponseInterceptor[] = [];
    private errorInterceptors: ErrorInterceptor[] = [];
    private pendingRequests: Array<{
        resolve: (value: any) => void;
        reject: (error: any) => void;
        url: string;
        options: RequestInit;
    }> = [];

    private constructor() {
        this.baseURL = BASE_URL;
        this.defaultHeaders = {
            'Content-Type': 'application/json'
        };
        this.setupDefaultInterceptors();
    }

    /**
     * Setup default interceptors for common functionality
     */
    private setupDefaultInterceptors(): void {
        // Default request interceptor - adds common headers and authentication
        this.addRequestInterceptor((url, options) => {
            // Add any default request processing here
            return { url, options };
        });

        // Default response interceptor - processes common response patterns
        this.addResponseInterceptor(<T>(response: Response, data: T) => {
            // Add any default response processing here
            return data;
        });

        // Default error interceptor - handles common error scenarios
        this.addErrorInterceptor((error: Error) => {
            // Add any default error processing here
            return error;
        });
    }

    /**
     * Add a request interceptor
     */
    public addRequestInterceptor(interceptor: RequestInterceptor): void {
        this.requestInterceptors.push(interceptor);
    }

    /**
     * Add a response interceptor
     */
    public addResponseInterceptor(interceptor: ResponseInterceptor): void {
        this.responseInterceptors.push(interceptor);
    }

    /**
     * Add an error interceptor
     */
    public addErrorInterceptor(interceptor: ErrorInterceptor): void {
        this.errorInterceptors.push(interceptor);
    }

    public static getInstance(): FetchClient {
        if (!FetchClient.instance) {
            FetchClient.instance = new FetchClient();
        }
        return FetchClient.instance;
    }

    /**
     * Build URL with query parameters
     */
    private buildUrlWithParams(url: string, params?: Record<string, string | number | boolean>): string {
        if (!params || Object.keys(params).length === 0) {
            return url;
        }

        const urlObj = new URL(url, this.baseURL);
        Object.entries(params).forEach(([key, value]) => {
            urlObj.searchParams.append(key, String(value));
        });

        return urlObj.toString();
    }

    /**
     * Core request method that handles all HTTP requests
     */
    public async request<T>(
        url: string, 
        options: RequestInit & RequestOptions = {}
    ): Promise<T> {
        let fullUrl = url.startsWith('http') ? url : `${this.baseURL}${url}`;
        
        // Add query parameters if provided
        if (options.params) {
            fullUrl = this.buildUrlWithParams(fullUrl, options.params);
        }
        
        // Prepare request options
        const requestOptions: RequestInit = {
            ...options,
            headers: {
                ...this.defaultHeaders,
                ...options.headers
            }
        };

        // Configure cookie handling
        const configuredOptions = this.configureRequestCookies(requestOptions, options);

        // Add timeout support
        if (options.timeout) {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), options.timeout);
            configuredOptions.signal = controller.signal;
            
            try {
                const response = await this.executeRequestWithRetry<T>(fullUrl, configuredOptions, options.retries || 0);
                clearTimeout(timeoutId);
                return response;
            } catch (error) {
                clearTimeout(timeoutId);
                if (error instanceof Error && error.name === 'AbortError') {
                    throw new TimeoutError(`Request timeout after ${options.timeout}ms`);
                }
                throw error;
            }
        }

        return this.executeRequestWithRetry<T>(fullUrl, configuredOptions, options.retries || 0);
    }

    /**
     * Execute request with retry logic for transient failures
     */
    private async executeRequestWithRetry<T>(url: string, options: RequestInit, retries: number): Promise<T> {
        let lastError: Error;
        
        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                return await this.executeRequest<T>(url, options);
            } catch (error) {
                lastError = error as Error;
                
                // Don't retry on authentication errors or client errors (4xx)
                if (error instanceof AuthenticationError || 
                    error instanceof AuthorizationError || 
                    error instanceof ValidationError) {
                    throw error;
                }
                
                // Don't retry on the last attempt
                if (attempt === retries) {
                    throw error;
                }
                
                // Only retry on network errors or server errors (5xx)
                if (error instanceof NetworkError || 
                    (error instanceof ServerError && error.status >= 500)) {
                    // Exponential backoff: wait 2^attempt * 1000ms
                    const delay = Math.pow(2, attempt) * 1000;
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }
                
                // Don't retry other types of errors
                throw error;
            }
        }
        
        throw lastError!;
    }

    /**
     * Execute the actual fetch request with error handling and interceptors
     */
    private async executeRequest<T>(url: string, options: RequestInit): Promise<T> {
        try {
            // Apply request interceptors
            let processedUrl = url;
            let processedOptions = options;
            
            for (const interceptor of this.requestInterceptors) {
                const result = await interceptor(processedUrl, processedOptions);
                processedUrl = result.url;
                processedOptions = result.options;
            }

            const response = await fetch(processedUrl, processedOptions);
            
            // Handle 401 responses with automatic token refresh
            if (response.status === 401) {
                return this.handleUnauthorized<T>(processedUrl, processedOptions);
            }

            // Process successful responses
            if (response.ok) {
                let data = await this.processResponse<T>(response);
                
                // Apply response interceptors
                for (const interceptor of this.responseInterceptors) {
                    data = await interceptor(response, data);
                }
                
                return data;
            }

            // Handle other HTTP errors
            throw await this.createHttpError(response);

        } catch (error) {
            // Apply error interceptors
            let processedError = error as Error;
            for (const interceptor of this.errorInterceptors) {
                processedError = await interceptor(processedError);
            }

            if (processedError instanceof TypeError && processedError.message.includes('fetch')) {
                throw new NetworkError('Network request failed', processedError);
            }
            throw processedError;
        }
    }

    /**
     * Handle 401 Unauthorized responses with automatic token refresh
     */
    private async handleUnauthorized<T>(url: string, options: RequestInit): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            if (this.isRefreshing) {
                // Queue this request to be retried after refresh completes
                this.pendingRequests.push({
                    resolve: (data: T) => resolve(data),
                    reject,
                    url,
                    options
                });
                return;
            }

            // Start the refresh process
            this.isRefreshing = true;
            this.refreshPromise = this.refreshToken();
            
            // Queue this request
            this.pendingRequests.push({
                resolve: (data: T) => resolve(data),
                reject,
                url,
                options
            });

            // Handle the refresh
            this.refreshPromise
                .then((success) => {
                    if (success) {
                        // Retry all pending requests
                        this.retryPendingRequests();
                    } else {
                        // Reject all pending requests
                        this.rejectPendingRequests(new AuthenticationError('Token refresh failed - please log in again'));
                    }
                })
                .catch((refreshError) => {
                    // Reject all pending requests with the refresh error
                    const error = typeof window === 'undefined' 
                        ? svelteError(401, { message: 'Unauthorized - Token refresh failed: ' + refreshError })
                        : new AuthenticationError('Token refresh failed - please log in again');
                    this.rejectPendingRequests(error);
                })
                .finally(() => {
                    this.isRefreshing = false;
                    this.refreshPromise = null;
                });
        });
    }

    /**
     * Retry all pending requests after successful token refresh
     */
    private async retryPendingRequests(): Promise<void> {
        const requests = [...this.pendingRequests];
        this.pendingRequests = [];

        for (const request of requests) {
            try {
                const result = await this.executeRequest(request.url, request.options);
                request.resolve(result);
            } catch (error) {
                request.reject(error);
            }
        }
    }

    /**
     * Reject all pending requests with the given error
     */
    private rejectPendingRequests(error: Error): void {
        const requests = [...this.pendingRequests];
        this.pendingRequests = [];

        for (const request of requests) {
            request.reject(error);
        }
    }

    /**
     * Attempt to refresh the access token
     */
    private async refreshToken(): Promise<boolean> {
        try {
            const response = await fetch(`${this.baseURL}/oauth/token`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    grant_type: 'refresh_token'
                }),
                credentials: 'include' // Include cookies for refresh token
            });

            if (response.ok) {
                // Token refresh successful
                return true;
            } else if (response.status === 401 || response.status === 403) {
                // Refresh token is expired or invalid
                console.warn('Refresh token expired or invalid, user needs to log in again');
                
                // Clear any authentication cookies if we're in a browser context
                if (typeof window !== 'undefined' && typeof document !== 'undefined') {
                    // Clear authentication cookies
                    document.cookie = 'access-token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
                    document.cookie = 'refresh-token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
                    document.cookie = 'access-token_expiration=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
                    document.cookie = 'refresh-token_expiration=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
                }
                
                return false;
            } else {
                // Other error during refresh
                console.error('Token refresh failed with status:', response.status);
                return false;
            }
        } catch (error) {
            console.error('Token refresh network error:', error);
            return false;
        }
    }

    /**
     * Process successful responses
     */
    private async processResponse<T>(response: Response): Promise<T> {
        // Handle empty responses (204 No Content, etc.)
        if (response.status === 204 || response.headers.get('content-length') === '0') {
            return undefined as T;
        }

        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            return response.json();
        }

        // For non-JSON responses, return as text
        return response.text() as T;
    }

    /**
     * Create HTTP error from response
     */
    private async createHttpError(response: Response): Promise<HttpError> {
        let errorData: any = null;
        
        try {
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                errorData = await response.json();
            }
        } catch {
            // Ignore JSON parsing errors
        }

        const message = errorData?.message || response.statusText || 'An error occurred';
        
        // Create specific error types based on status code
        switch (response.status) {
            case 401:
                return new AuthenticationError(message, response, errorData);
            case 403:
                return new AuthorizationError(message, response, errorData);
            case 400:
                return new ValidationError(message, errorData?.errors, response, errorData);
            case 404:
                return new HttpError('Resource not found', response.status, response, errorData);
            case 422:
                return new ValidationError(message, errorData?.errors, response, errorData);
            default:
                if (response.status >= 500) {
                    return new ServerError(message, response.status, response, errorData);
                }
                return new HttpError(message, response.status, response, errorData);
        }
    }

    /**
     * Build cookie header for server-side requests
     */
    private buildCookieHeader(cookies: Cookies): string {
        const cookieEntries: string[] = [];
        
        // Get authentication cookies that need to be forwarded
        const authCookies = [
            'access-token',
            'refresh-token',
            'access-token_expiration',
            'refresh-token_expiration',
            'trenara_session'
        ];
        
        for (const cookieName of authCookies) {
            const cookieValue = cookies.get(cookieName);
            if (cookieValue) {
                cookieEntries.push(`${cookieName}=${cookieValue}`);
            }
        }
        
        return cookieEntries.join('; ');
    }

    /**
     * Configure request for automatic cookie handling
     */
    private configureRequestCookies(options: RequestInit, requestOptions: RequestOptions): RequestInit {
        const configuredOptions = { ...options };
        
        if (typeof window !== 'undefined') {
            // Client-side: cookies are automatically included for same-origin requests
            configuredOptions.credentials = 'include';
        } else if (requestOptions.cookies) {
            // Server-side: manually forward cookies
            const cookieHeader = this.buildCookieHeader(requestOptions.cookies);
            if (cookieHeader) {
                configuredOptions.headers = {
                    ...configuredOptions.headers,
                    'Cookie': cookieHeader
                };
            }
        }
        
        return configuredOptions;
    }

    /**
     * HTTP GET method
     */
    public async get<T>(url: string, options: RequestOptions = {}): Promise<T> {
        return this.request<T>(url, { ...options, method: 'GET' });
    }

    /**
     * HTTP POST method
     */
    public async post<T>(url: string, data?: any, options: RequestOptions = {}): Promise<T> {
        const requestOptions: RequestInit & RequestOptions = {
            ...options,
            method: 'POST'
        };

        if (data !== undefined) {
            requestOptions.body = JSON.stringify(data);
        }

        return this.request<T>(url, requestOptions);
    }

    /**
     * HTTP PUT method
     */
    public async put<T>(url: string, data?: any, options: RequestOptions = {}): Promise<T> {
        const requestOptions: RequestInit & RequestOptions = {
            ...options,
            method: 'PUT'
        };

        if (data !== undefined) {
            requestOptions.body = JSON.stringify(data);
        }

        return this.request<T>(url, requestOptions);
    }

    /**
     * HTTP DELETE method
     */
    public async delete<T>(url: string, options: RequestOptions = {}): Promise<T> {
        return this.request<T>(url, { ...options, method: 'DELETE' });
    }
}

export const fetchClient = FetchClient.getInstance();
