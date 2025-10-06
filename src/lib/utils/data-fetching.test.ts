import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createAsyncData, createCachedAsyncData, DataFetcher } from './data-fetching.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Data Fetching Utilities', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		DataFetcher.clearCache();
	});

	afterEach(() => {
		vi.clearAllTimers();
	});

	describe('createAsyncData', () => {
		it('should initialize with correct default state', () => {
			const fetcher = vi.fn().mockResolvedValue('test data');
			const asyncData = createAsyncData(fetcher);

			expect(asyncData.data).toBeNull();
			expect(asyncData.loading).toBe(false);
			expect(asyncData.error).toBeNull();
		});

		it('should handle successful data loading', async () => {
			const testData = { id: 1, name: 'test' };
			const fetcher = vi.fn().mockResolvedValue(testData);
			const asyncData = createAsyncData(fetcher);

			await asyncData.load();

			expect(asyncData.data).toEqual(testData);
			expect(asyncData.loading).toBe(false);
			expect(asyncData.error).toBeNull();
			expect(fetcher).toHaveBeenCalledOnce();
		});

		it('should handle errors correctly', async () => {
			const testError = new Error('Test error');
			const fetcher = vi.fn().mockRejectedValue(testError);
			const asyncData = createAsyncData(fetcher);

			await expect(asyncData.load()).rejects.toThrow('Test error');

			expect(asyncData.data).toBeNull();
			expect(asyncData.loading).toBe(false);
			expect(asyncData.error).toEqual(testError);
		});

		it('should implement retry logic', async () => {
			const testError = new Error('Network error');
			const fetcher = vi
				.fn()
				.mockRejectedValueOnce(testError)
				.mockRejectedValueOnce(testError)
				.mockResolvedValue('success');

			const asyncData = createAsyncData(fetcher, {
				retries: 2,
				retryDelay: 10
			});

			vi.useFakeTimers();

			const loadPromise = asyncData.load();

			// Fast-forward through retry delays
			await vi.advanceTimersByTimeAsync(30);

			await loadPromise;

			expect(fetcher).toHaveBeenCalledTimes(3);
			expect(asyncData.data).toBe('success');
			expect(asyncData.error).toBeNull();

			vi.useRealTimers();
		});

		it('should call success callback', async () => {
			const testData = 'success data';
			const fetcher = vi.fn().mockResolvedValue(testData);
			const onSuccess = vi.fn();

			const asyncData = createAsyncData(fetcher, { onSuccess });

			await asyncData.load();

			expect(onSuccess).toHaveBeenCalledWith(testData);
		});

		it('should call error callback', async () => {
			const testError = new Error('Test error');
			const fetcher = vi.fn().mockRejectedValue(testError);
			const onError = vi.fn();

			const asyncData = createAsyncData(fetcher, { onError });

			await expect(asyncData.load()).rejects.toThrow();

			expect(onError).toHaveBeenCalledWith(testError);
		});

		it('should prevent concurrent loads', async () => {
			const fetcher = vi
				.fn()
				.mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve('data'), 100)));

			const asyncData = createAsyncData(fetcher);

			// Start two loads concurrently
			const load1 = asyncData.load();
			const load2 = asyncData.load();

			await Promise.all([load1, load2]);

			// Fetcher should only be called once
			expect(fetcher).toHaveBeenCalledOnce();
		});

		it('should reset state correctly', () => {
			const fetcher = vi.fn().mockResolvedValue('test');
			const asyncData = createAsyncData(fetcher);

			// Manually set some state
			asyncData.load();

			asyncData.reset();

			expect(asyncData.data).toBeNull();
			expect(asyncData.loading).toBe(false);
			expect(asyncData.error).toBeNull();
		});
	});

	describe('createCachedAsyncData', () => {
		it('should cache data correctly', async () => {
			const fetcher = vi.fn().mockResolvedValue('cached data');
			const asyncData = createCachedAsyncData(fetcher, 'test-key', 1000);

			// First load
			await asyncData.load();
			expect(fetcher).toHaveBeenCalledOnce();

			// Second load should use cache
			await asyncData.load();
			expect(fetcher).toHaveBeenCalledOnce(); // Still only called once
			expect(asyncData.data).toBe('cached data');
		});

		it('should expire cache after TTL', async () => {
			vi.useFakeTimers();

			const fetcher = vi
				.fn()
				.mockResolvedValueOnce('first data')
				.mockResolvedValueOnce('second data');

			const asyncData = createCachedAsyncData(fetcher, 'test-key', 100);

			// First load
			await asyncData.load();
			expect(asyncData.data).toBe('first data');

			// Advance time past TTL
			vi.advanceTimersByTime(150);

			// Second load should fetch new data
			await asyncData.load();
			expect(fetcher).toHaveBeenCalledTimes(2);
			expect(asyncData.data).toBe('second data');

			vi.useRealTimers();
		});
	});

	describe('DataFetcher', () => {
		describe('fetchWithRetry', () => {
			it('should retry failed requests', async () => {
				const fetcher = vi
					.fn()
					.mockRejectedValueOnce(new Error('Fail 1'))
					.mockRejectedValueOnce(new Error('Fail 2'))
					.mockResolvedValue('Success');

				vi.useFakeTimers();

				const resultPromise = DataFetcher.fetchWithRetry(fetcher, 2, 10);

				// Fast-forward through retry delays
				await vi.advanceTimersByTimeAsync(30);

				const result = await resultPromise;

				expect(result).toBe('Success');
				expect(fetcher).toHaveBeenCalledTimes(3);

				vi.useRealTimers();
			});

			it('should throw after max retries', async () => {
				const fetcher = vi.fn().mockRejectedValue(new Error('Always fails'));

				await expect(DataFetcher.fetchWithRetry(fetcher, 0, 10)).rejects.toThrow('Always fails');
				expect(fetcher).toHaveBeenCalledOnce(); // No retries with maxRetries = 0
			});
		});

		describe('fetchWithCache', () => {
			it('should cache results', async () => {
				const fetcher = vi.fn().mockResolvedValue('cached result');

				const result1 = await DataFetcher.fetchWithCache(fetcher, 'cache-key', 1000);
				const result2 = await DataFetcher.fetchWithCache(fetcher, 'cache-key', 1000);

				expect(result1).toBe('cached result');
				expect(result2).toBe('cached result');
				expect(fetcher).toHaveBeenCalledOnce();
			});

			it('should expire cache', async () => {
				vi.useFakeTimers();

				const fetcher = vi.fn().mockResolvedValueOnce('first').mockResolvedValueOnce('second');

				const result1 = await DataFetcher.fetchWithCache(fetcher, 'cache-key', 100);

				vi.advanceTimersByTime(150);

				const result2 = await DataFetcher.fetchWithCache(fetcher, 'cache-key', 100);

				expect(result1).toBe('first');
				expect(result2).toBe('second');
				expect(fetcher).toHaveBeenCalledTimes(2);

				vi.useRealTimers();
			});
		});

		describe('clearCache', () => {
			it('should clear all cache when no pattern provided', async () => {
				const fetcher = vi.fn().mockResolvedValue('data');

				await DataFetcher.fetchWithCache(fetcher, 'key1', 1000);
				await DataFetcher.fetchWithCache(fetcher, 'key2', 1000);

				DataFetcher.clearCache();

				// Should fetch again after cache clear
				await DataFetcher.fetchWithCache(fetcher, 'key1', 1000);
				expect(fetcher).toHaveBeenCalledTimes(3); // 2 initial + 1 after clear
			});

			it('should clear cache by pattern', async () => {
				const fetcher = vi.fn().mockResolvedValue('data');

				await DataFetcher.fetchWithCache(fetcher, 'user-123', 1000);
				await DataFetcher.fetchWithCache(fetcher, 'user-456', 1000);
				await DataFetcher.fetchWithCache(fetcher, 'schedule-2024', 1000);

				DataFetcher.clearCache('user-.*');

				// User caches should be cleared, schedule should remain
				await DataFetcher.fetchWithCache(fetcher, 'user-123', 1000); // Should fetch
				await DataFetcher.fetchWithCache(fetcher, 'schedule-2024', 1000); // Should use cache

				expect(fetcher).toHaveBeenCalledTimes(4); // 3 initial + 1 after pattern clear
			});
		});
	});

	describe('API Error Handling', () => {
		it('should handle 401 authentication errors', async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 401,
				json: () => Promise.resolve({ error: 'Unauthorized' })
			});

			const fetcher = async () => {
				const response = await fetch('/api/test');
				if (!response.ok) {
					const errorData = await response.json();
					if (response.status === 401) {
						const error = new Error('Authentication required');
						(error as any).code = 'AUTHENTICATION_REQUIRED';
						(error as any).status = 401;
						throw error;
					}
				}
				return response.json();
			};

			const asyncData = createAsyncData(fetcher);

			await expect(asyncData.load()).rejects.toThrow('Authentication required');
			expect(asyncData.error?.code).toBe('AUTHENTICATION_REQUIRED');
		});

		it('should handle 503 database unavailable errors', async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 503,
				json: () =>
					Promise.resolve({
						code: 'DATABASE_UNAVAILABLE',
						error: 'Database unavailable',
						fallback: true,
						records: []
					})
			});

			const fetcher = async () => {
				const response = await fetch('/api/test');
				if (!response.ok) {
					const errorData = await response.json();
					if (response.status === 503 && errorData.code === 'DATABASE_UNAVAILABLE') {
						const error = new Error('Database unavailable');
						(error as any).code = 'DATABASE_UNAVAILABLE';
						(error as any).status = 503;
						(error as any).fallback = errorData.fallback;
						(error as any).records = errorData.records;
						throw error;
					}
				}
				return response.json();
			};

			const asyncData = createAsyncData(fetcher);

			await expect(asyncData.load()).rejects.toThrow('Database unavailable');
			expect(asyncData.error?.code).toBe('DATABASE_UNAVAILABLE');
			expect(asyncData.error?.fallback).toBe(true);
		});
	});
});
