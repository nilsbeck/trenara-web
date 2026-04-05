import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Cookies } from '@sveltejs/kit';
import { TokenType } from './types';

vi.mock('$app/environment', () => ({ dev: false }));

vi.mock('$lib/server/trenara/auth', () => ({
	authApi: {
		refreshToken: vi.fn(),
		login: vi.fn()
	}
}));

// ─────────────────────────────────────────────────────────────
// Cookies mock that records set() options so we can assert on them
// ─────────────────────────────────────────────────────────────
type CookieEntry = { value: string; options: Record<string, unknown> };

function makeCookies(initial: Record<string, string> = {}): Cookies & {
	_store: Record<string, CookieEntry>;
} {
	const store: Record<string, CookieEntry> = {};
	for (const [k, v] of Object.entries(initial)) {
		store[k] = { value: v, options: {} };
	}
	return {
		_store: store,
		get: (name: string) => store[name]?.value,
		getAll: () => Object.entries(store).map(([name, { value }]) => ({ name, value })),
		set: (name: string, value: string, options: Record<string, unknown>) => {
			store[name] = { value, options };
		},
		delete: (name: string) => {
			delete store[name];
		},
		serialize: () => ''
	} as unknown as Cookies & { _store: Record<string, CookieEntry> };
}

// ─────────────────────────────────────────────────────────────
// Re-import the singleton after mocks are in place
// ─────────────────────────────────────────────────────────────
let manager: import('./token-manager').TokenManager;

beforeEach(async () => {
	vi.clearAllMocks();
	const mod = await import('./token-manager');
	manager = mod.TokenManager.getInstance();
});

// ─────────────────────────────────────────────────────────────
// setToken
// ─────────────────────────────────────────────────────────────
describe('setToken', () => {
	it('includes maxAge on the token cookie', () => {
		const now = 1_000_000_000_000;
		vi.spyOn(Date, 'now').mockReturnValue(now);

		const cookies = makeCookies();
		const expiresAt = new Date(now + 3600 * 1000); // 1 hour from now

		manager.setToken(cookies, 'tok', TokenType.AccessToken, expiresAt);

		const opts = cookies._store[TokenType.AccessToken].options;
		expect(opts.maxAge).toBe(3600);
	});

	it('includes maxAge on the expiration cookie', () => {
		const now = 1_000_000_000_000;
		vi.spyOn(Date, 'now').mockReturnValue(now);

		const cookies = makeCookies();
		const expiresAt = new Date(now + 7200 * 1000); // 2 hours from now

		manager.setToken(cookies, 'tok', TokenType.RefreshToken, expiresAt);

		const opts = cookies._store[`${TokenType.RefreshToken}_expiration`].options;
		expect(opts.maxAge).toBe(7200);
	});

	it('sets httpOnly only on the token cookie, not the expiration cookie', () => {
		const cookies = makeCookies();
		const expiresAt = new Date(Date.now() + 3600 * 1000);

		manager.setToken(cookies, 'tok', TokenType.AccessToken, expiresAt);

		expect(cookies._store[TokenType.AccessToken].options.httpOnly).toBe(true);
		expect(cookies._store[`${TokenType.AccessToken}_expiration`].options.httpOnly).toBeUndefined();
	});

	it('sets secure:true in production (dev=false)', () => {
		const cookies = makeCookies();
		const expiresAt = new Date(Date.now() + 3600 * 1000);

		manager.setToken(cookies, 'tok', TokenType.AccessToken, expiresAt);

		expect(cookies._store[TokenType.AccessToken].options.secure).toBe(true);
		expect(cookies._store[`${TokenType.AccessToken}_expiration`].options.secure).toBe(true);
	});

	it('stores the expiration value as an ISO string', () => {
		const cookies = makeCookies();
		const expiresAt = new Date(Date.now() + 3600 * 1000);

		manager.setToken(cookies, 'tok', TokenType.AccessToken, expiresAt);

		expect(cookies._store[`${TokenType.AccessToken}_expiration`].value).toBe(expiresAt.toISOString());
	});

	it('sets path "/" and sameSite "lax" on both cookies', () => {
		const cookies = makeCookies();
		const expiresAt = new Date(Date.now() + 3600 * 1000);

		manager.setToken(cookies, 'tok', TokenType.AccessToken, expiresAt);

		for (const key of [TokenType.AccessToken, `${TokenType.AccessToken}_expiration`]) {
			expect(cookies._store[key].options.path).toBe('/');
			expect(cookies._store[key].options.sameSite).toBe('lax');
		}
	});
});

// ─────────────────────────────────────────────────────────────
// validateAndRefreshToken
// ─────────────────────────────────────────────────────────────
describe('validateAndRefreshToken', () => {
	it('returns false when there is no access token', async () => {
		const cookies = makeCookies();
		expect(await manager.validateAndRefreshToken(cookies)).toBe(false);
	});

	it('returns false when the expiration cookie is missing', async () => {
		const cookies = makeCookies({ 'access-token': 'tok' });
		expect(await manager.validateAndRefreshToken(cookies)).toBe(false);
	});

	it('returns true for a token more than 12 hours from expiry', async () => {
		const expiry = new Date(Date.now() + 48 * 3600 * 1000); // 48 h from now
		const cookies = makeCookies({
			'access-token': 'tok',
			'access-token_expiration': expiry.toISOString()
		});

		expect(await manager.validateAndRefreshToken(cookies)).toBe(true);
	});

	it('correctly parses an ISO expiration string (regression: parseInt gave wrong year)', async () => {
		// The old code did parseInt("2026-04-05T...") = 2026, which is always
		// less than Date.now()/1000 (~1.7 billion). That made expirationDate > now
		// always false, so refresh never triggered.
		// This test confirms the ISO string is parsed as a proper Unix timestamp.
		const { authApi } = await import('$lib/server/trenara/auth');
		vi.mocked(authApi.refreshToken).mockResolvedValueOnce({
			access_token: 'new-access',
			refresh_token: 'new-refresh',
			expires_in: 86400,
			token_type: 'Bearer'
		});

		// Expiry in 6 hours — inside the 12-hour refresh window
		const expiry = new Date(Date.now() + 6 * 3600 * 1000);
		const cookies = makeCookies({
			'access-token': 'old-tok',
			'refresh-token': 'old-refresh',
			'access-token_expiration': expiry.toISOString()
		});

		const result = await manager.validateAndRefreshToken(cookies);

		expect(result).toBe(true);
		expect(authApi.refreshToken).toHaveBeenCalledOnce();
		expect(authApi.refreshToken).toHaveBeenCalledWith({ refresh_token: 'old-refresh' });
	});

	it('updates cookies with new tokens after a successful refresh', async () => {
		const { authApi } = await import('$lib/server/trenara/auth');
		vi.mocked(authApi.refreshToken).mockResolvedValueOnce({
			access_token: 'new-access',
			refresh_token: 'new-refresh',
			expires_in: 86400,
			token_type: 'Bearer'
		});

		const expiry = new Date(Date.now() + 6 * 3600 * 1000);
		const cookies = makeCookies({
			'access-token': 'old-tok',
			'refresh-token': 'old-refresh',
			'access-token_expiration': expiry.toISOString()
		});

		await manager.validateAndRefreshToken(cookies);

		expect(cookies._store['access-token'].value).toBe('new-access');
		expect(cookies._store['refresh-token'].value).toBe('new-refresh');
	});

	it('returns false when refresh token is missing during refresh', async () => {
		const expiry = new Date(Date.now() + 6 * 3600 * 1000);
		// No refresh-token in jar
		const cookies = makeCookies({
			'access-token': 'old-tok',
			'access-token_expiration': expiry.toISOString()
		});

		expect(await manager.validateAndRefreshToken(cookies)).toBe(false);
	});

	it('returns false when the refresh API call fails', async () => {
		const { authApi } = await import('$lib/server/trenara/auth');
		vi.mocked(authApi.refreshToken).mockRejectedValueOnce(new Error('network error'));

		const expiry = new Date(Date.now() + 6 * 3600 * 1000);
		const cookies = makeCookies({
			'access-token': 'old-tok',
			'refresh-token': 'old-refresh',
			'access-token_expiration': expiry.toISOString()
		});

		expect(await manager.validateAndRefreshToken(cookies)).toBe(false);
	});
});

// ─────────────────────────────────────────────────────────────
// deleteToken
// ─────────────────────────────────────────────────────────────
describe('deleteToken', () => {
	it('removes both the token and its expiration cookie', () => {
		const cookies = makeCookies({
			'access-token': 'tok',
			'access-token_expiration': new Date().toISOString()
		});

		manager.deleteToken(cookies, TokenType.AccessToken);

		expect(cookies._store['access-token']).toBeUndefined();
		expect(cookies._store['access-token_expiration']).toBeUndefined();
	});
});

// ─────────────────────────────────────────────────────────────
// logout
// ─────────────────────────────────────────────────────────────
describe('logout', () => {
	it('clears all session cookies', async () => {
		const expiry = new Date().toISOString();
		const cookies = makeCookies({
			'access-token': 'a',
			'access-token_expiration': expiry,
			'refresh-token': 'r',
			'refresh-token_expiration': expiry,
			user_id: '42',
			user_email: 'user@example.com',
			trenara_session: 'sess'
		});

		await manager.logout(cookies);

		for (const key of [
			'access-token',
			'access-token_expiration',
			'refresh-token',
			'refresh-token_expiration',
			'user_id',
			'user_email',
			'trenara_session'
		]) {
			expect(cookies._store[key]).toBeUndefined();
		}
	});
});
