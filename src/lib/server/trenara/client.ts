import type { Cookies } from '@sveltejs/kit';
import { TokenType } from '$lib/server/auth/types';

const BASE_URL = 'https://backend-prod.trenara.com';

export interface RequestOptions {
	headers?: Record<string, string>;
	cookies?: Cookies;
	timeout?: number;
	retries?: number;
	params?: Record<string, string | number | boolean>;
}

export class HttpError extends Error {
	constructor(
		message: string,
		public status: number,
		public data?: unknown
	) {
		super(message);
		this.name = 'HttpError';
	}
}

export class AuthenticationError extends HttpError {
	constructor(message: string, data?: unknown) {
		super(message, 401, data);
		this.name = 'AuthenticationError';
	}
}

export class NetworkError extends Error {
	constructor(message: string, public originalError?: Error) {
		super(message);
		this.name = 'NetworkError';
	}
}

export class TimeoutError extends Error {
	constructor(message = 'Request timeout') {
		super(message);
		this.name = 'TimeoutError';
	}
}

class FetchClient {
	private static instance: FetchClient;

	private constructor() {}

	static getInstance(): FetchClient {
		if (!FetchClient.instance) {
			FetchClient.instance = new FetchClient();
		}
		return FetchClient.instance;
	}

	private buildUrl(url: string, params?: Record<string, string | number | boolean>): string {
		const fullUrl = url.startsWith('http') ? url : `${BASE_URL}${url}`;
		if (!params || Object.keys(params).length === 0) return fullUrl;

		const urlObj = new URL(fullUrl);
		for (const [key, value] of Object.entries(params)) {
			urlObj.searchParams.append(key, String(value));
		}
		return urlObj.toString();
	}

	private buildCookieHeader(cookies: Cookies): string {
		const cookieNames = [
			TokenType.AccessToken,
			TokenType.RefreshToken,
			`${TokenType.AccessToken}_expiration`,
			`${TokenType.RefreshToken}_expiration`,
			'trenara_session'
		];

		return cookieNames
			.map((name) => {
				const value = cookies.get(name);
				return value ? `${name}=${value}` : null;
			})
			.filter(Boolean)
			.join('; ');
	}

	async request<T>(url: string, options: RequestOptions & Omit<RequestInit, 'headers'> = {}): Promise<T> {
		const fullUrl = this.buildUrl(url, options.params);
		const maxRetries = options.retries ?? 0;

		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
			...(options.headers ?? {})
		};

		// Forward cookies on server-side
		if (options.cookies) {
			const cookieHeader = this.buildCookieHeader(options.cookies);
			if (cookieHeader) {
				headers['Cookie'] = cookieHeader;
			}
		}

		const fetchOptions: RequestInit = {
			...options,
			headers
		};

		let lastError: Error = new Error('Request failed');

		for (let attempt = 0; attempt <= maxRetries; attempt++) {
			try {
				const controller = new AbortController();
				const timeoutId = options.timeout
					? setTimeout(() => controller.abort(), options.timeout)
					: null;

				const response = await fetch(fullUrl, {
					...fetchOptions,
					signal: controller.signal
				});

				if (timeoutId) clearTimeout(timeoutId);

				if (response.status === 401) {
					throw new AuthenticationError('Unauthorized');
				}

				if (response.ok) {
					if (response.status === 204) return undefined as T;
					const contentType = response.headers.get('content-type');
					if (contentType?.includes('application/json')) {
						return response.json() as Promise<T>;
					}
					return response.text() as unknown as T;
				}

				let errorData: unknown = null;
				try {
					errorData = await response.json();
				} catch {
					// ignore parse errors
				}

				throw new HttpError(
					(errorData as Record<string, string>)?.message ?? response.statusText,
					response.status,
					errorData
				);
			} catch (error) {
				lastError = error as Error;

				if (error instanceof Error && error.name === 'AbortError') {
					throw new TimeoutError(`Request timeout after ${options.timeout}ms`);
				}

				if (error instanceof AuthenticationError) throw error;

				// Only retry on network/server errors
				const isRetryable =
					error instanceof NetworkError ||
					(error instanceof HttpError && error.status >= 500);

				if (isRetryable && attempt < maxRetries) {
					await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 1000));
					continue;
				}

				if (error instanceof TypeError && (error as Error).message.includes('fetch')) {
					throw new NetworkError('Network request failed', error as Error);
				}

				throw error;
			}
		}

		throw lastError;
	}

	async get<T>(url: string, options: RequestOptions = {}): Promise<T> {
		return this.request<T>(url, { ...options, method: 'GET' });
	}

	async post<T>(url: string, data?: unknown, options: RequestOptions = {}): Promise<T> {
		return this.request<T>(url, {
			...options,
			method: 'POST',
			body: data !== undefined ? JSON.stringify(data) : undefined
		});
	}

	async put<T>(url: string, data?: unknown, options: RequestOptions = {}): Promise<T> {
		return this.request<T>(url, {
			...options,
			method: 'PUT',
			body: data !== undefined ? JSON.stringify(data) : undefined
		});
	}

	async delete<T>(url: string, options: RequestOptions = {}): Promise<T> {
		return this.request<T>(url, { ...options, method: 'DELETE' });
	}
}

export const fetchClient = FetchClient.getInstance();
