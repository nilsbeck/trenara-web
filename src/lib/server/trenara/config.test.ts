import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Cookies } from '@sveltejs/kit';
import { TokenType } from '$lib/server/auth/types';
import { configApi } from './config';
import type { AppConfig } from './types';

const ACCESS_TOKEN = 'test-access-token';

function makeCookies(): Cookies {
	return {
		get: (name: string) => (name === TokenType.AccessToken ? ACCESS_TOKEN : undefined)
	} as unknown as Cookies;
}

function mockResponse(body: unknown, status = 200) {
	return {
		ok: status >= 200 && status < 300,
		status,
		statusText: 'OK',
		headers: new Headers({ 'content-type': 'application/json' }),
		json: () => Promise.resolve(body),
		text: () => Promise.resolve(JSON.stringify(body))
	} as unknown as Response;
}

function fetchMock() {
	return globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
}

const CONFIG = {
	shoes: { brands: ['Adidas', 'Other'], types: [] },
	cross_training: { percentage_range: 40, types: [] }
} as unknown as AppConfig;

let cookies: Cookies;

beforeEach(() => {
	vi.stubGlobal('fetch', vi.fn());
	cookies = makeCookies();
	configApi.clearAppConfigCache();
});

afterEach(() => {
	vi.restoreAllMocks();
	configApi.clearAppConfigCache();
});

describe('configApi.getAppConfig', () => {
	it('asks the config endpoint with the access token', async () => {
		fetchMock().mockResolvedValue(mockResponse(CONFIG));

		await configApi.getAppConfig(cookies);

		const [url, init] = fetchMock().mock.calls.at(-1) as [string, RequestInit];
		expect(String(url)).toContain('/api/config/app');
		expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${ACCESS_TOKEN}`);
	});

	it('fetches once and serves the rest from memory', async () => {
		fetchMock().mockResolvedValue(mockResponse(CONFIG));

		const first = await configApi.getAppConfig(cookies);
		const second = await configApi.getAppConfig(cookies);

		expect(fetchMock()).toHaveBeenCalledTimes(1);
		expect(second).toBe(first);
	});

	it('shares one request between callers that arrive together', async () => {
		fetchMock().mockResolvedValue(mockResponse(CONFIG));

		// A cold cache and several page loads at once is one fetch, not several.
		await Promise.all([
			configApi.getAppConfig(cookies),
			configApi.getAppConfig(cookies),
			configApi.getAppConfig(cookies)
		]);

		expect(fetchMock()).toHaveBeenCalledTimes(1);
	});

	it('does not cache a failure', async () => {
		fetchMock().mockResolvedValueOnce(mockResponse({ message: 'nope' }, 500));
		await expect(configApi.getAppConfig(cookies)).rejects.toThrow();

		fetchMock().mockResolvedValue(mockResponse(CONFIG));
		await expect(configApi.getAppConfig(cookies)).resolves.toEqual(CONFIG);
	});
});
