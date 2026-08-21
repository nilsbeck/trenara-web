import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Cookies } from '@sveltejs/kit';
import { TokenType } from './types';

vi.mock('$app/environment', () => ({ dev: false }));

vi.mock('$lib/server/auth/user-identity', () => ({
	signUserId: (id: number) => `sig-${id}`
}));

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
	// Reset the module registry too: TokenManager is a singleton that caches
	// in-flight refreshes, and that cache must not leak between tests.
	vi.resetModules();
	vi.clearAllMocks();
	const mod = await import('./token-manager');
	manager = mod.TokenManager.getInstance();
});

// ─────────────────────────────────────────────────────────────
// setToken
// ─────────────────────────────────────────────────────────────
describe('setToken', () => {
	it('outlives the access token so the refresh token survives it', async () => {
		const { SESSION_COOKIE_MAX_AGE } = await import('./token-manager');
		const cookies = makeCookies();
		const expiresAt = new Date(Date.now() + 3600 * 1000); // 1 hour from now

		manager.setToken(cookies, 'tok', TokenType.AccessToken, expiresAt);

		const opts = cookies._store[TokenType.AccessToken].options;
		expect(opts.maxAge).toBe(SESSION_COOKIE_MAX_AGE);
		expect(SESSION_COOKIE_MAX_AGE).toBeGreaterThan(3600);
	});

	it('gives the expiration cookie the same long lifetime', async () => {
		const { SESSION_COOKIE_MAX_AGE } = await import('./token-manager');
		const cookies = makeCookies();
		const expiresAt = new Date(Date.now() + 7200 * 1000); // 2 hours from now

		manager.setToken(cookies, 'tok', TokenType.RefreshToken, expiresAt);

		const opts = cookies._store[`${TokenType.RefreshToken}_expiration`].options;
		expect(opts.maxAge).toBe(SESSION_COOKIE_MAX_AGE);
	});

	it('sets httpOnly on both the token cookie and the expiration cookie', () => {
		const cookies = makeCookies();
		const expiresAt = new Date(Date.now() + 3600 * 1000);

		manager.setToken(cookies, 'tok', TokenType.AccessToken, expiresAt);

		expect(cookies._store[TokenType.AccessToken].options.httpOnly).toBe(true);
		expect(cookies._store[`${TokenType.AccessToken}_expiration`].options.httpOnly).toBe(true);
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

		expect(cookies._store[`${TokenType.AccessToken}_expiration`].value).toBe(
			expiresAt.toISOString()
		);
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
	it('returns invalid when there are no tokens at all', async () => {
		const cookies = makeCookies();
		expect(await manager.validateAndRefreshToken(cookies)).toBe('invalid');
	});

	it('refreshes when the expiration cookie is missing', async () => {
		const { authApi } = await import('$lib/server/trenara/auth');
		vi.mocked(authApi.refreshToken).mockResolvedValueOnce({
			access_token: 'new-access',
			refresh_token: 'new-refresh',
			expires_in: 86400,
			token_type: 'Bearer'
		});

		const cookies = makeCookies({ 'access-token': 'tok', 'refresh-token': 'r' });

		expect(await manager.validateAndRefreshToken(cookies)).toBe('refreshed');
	});

	it('returns valid for a token more than 12 hours from expiry', async () => {
		const expiry = new Date(Date.now() + 48 * 3600 * 1000); // 48 h from now
		const cookies = makeCookies({
			'access-token': 'tok',
			'access-token_expiration': expiry.toISOString()
		});

		expect(await manager.validateAndRefreshToken(cookies)).toBe('valid');
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

		expect(result).toBe('refreshed');
		expect(authApi.refreshToken).toHaveBeenCalledOnce();
		expect(authApi.refreshToken).toHaveBeenCalledWith({ refresh_token: 'old-refresh' });
	});

	it('refreshes an already-expired access token instead of ending the session', async () => {
		const { authApi } = await import('$lib/server/trenara/auth');
		vi.mocked(authApi.refreshToken).mockResolvedValueOnce({
			access_token: 'new-access',
			refresh_token: 'new-refresh',
			expires_in: 86400,
			token_type: 'Bearer'
		});

		const expiry = new Date(Date.now() - 30 * 24 * 3600 * 1000); // a month ago
		const cookies = makeCookies({
			'access-token': 'old-tok',
			'refresh-token': 'old-refresh',
			'access-token_expiration': expiry.toISOString()
		});

		expect(await manager.validateAndRefreshToken(cookies)).toBe('refreshed');
		expect(cookies._store['access-token'].value).toBe('new-access');
	});

	it('refreshes when the access token cookie is gone but the refresh token is not', async () => {
		const { authApi } = await import('$lib/server/trenara/auth');
		vi.mocked(authApi.refreshToken).mockResolvedValueOnce({
			access_token: 'new-access',
			refresh_token: 'new-refresh',
			expires_in: 86400,
			token_type: 'Bearer'
		});

		const cookies = makeCookies({ 'refresh-token': 'old-refresh' });

		expect(await manager.validateAndRefreshToken(cookies)).toBe('refreshed');
		expect(cookies._store['access-token'].value).toBe('new-access');
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

	it('returns invalid when the refresh token is missing during refresh', async () => {
		const expiry = new Date(Date.now() + 6 * 3600 * 1000);
		// No refresh-token in jar
		const cookies = makeCookies({
			'access-token': 'old-tok',
			'access-token_expiration': expiry.toISOString()
		});

		expect(await manager.validateAndRefreshToken(cookies)).toBe('invalid');
	});

	it('returns unavailable — not invalid — when the refresh call fails on the network', async () => {
		const { authApi } = await import('$lib/server/trenara/auth');
		const { NetworkError } = await import('$lib/server/trenara/client');
		vi.mocked(authApi.refreshToken).mockRejectedValueOnce(new NetworkError('network error'));

		const expiry = new Date(Date.now() + 6 * 3600 * 1000);
		const cookies = makeCookies({
			'access-token': 'old-tok',
			'refresh-token': 'transient-refresh',
			'access-token_expiration': expiry.toISOString()
		});

		expect(await manager.validateAndRefreshToken(cookies)).toBe('unavailable');
		// The session cookies must survive so the next request can retry.
		expect(cookies._store['refresh-token'].value).toBe('transient-refresh');
	});

	it('returns unavailable when the auth server returns a 5xx', async () => {
		const { authApi } = await import('$lib/server/trenara/auth');
		const { HttpError } = await import('$lib/server/trenara/client');
		vi.mocked(authApi.refreshToken).mockRejectedValueOnce(new HttpError('boom', 502));

		const cookies = makeCookies({ 'refresh-token': 'server-down-refresh' });

		expect(await manager.validateAndRefreshToken(cookies)).toBe('unavailable');
	});

	it('returns invalid when the auth server rejects the refresh token', async () => {
		const { authApi } = await import('$lib/server/trenara/auth');
		const { AuthenticationError } = await import('$lib/server/trenara/client');
		vi.mocked(authApi.refreshToken).mockRejectedValueOnce(new AuthenticationError('nope'));

		const cookies = makeCookies({ 'refresh-token': 'revoked-refresh' });

		expect(await manager.validateAndRefreshToken(cookies)).toBe('invalid');
	});

	it('refreshes once for concurrent requests carrying the same token', async () => {
		const { authApi } = await import('$lib/server/trenara/auth');
		vi.mocked(authApi.refreshToken).mockResolvedValue({
			access_token: 'new-access',
			refresh_token: 'new-refresh',
			expires_in: 86400,
			token_type: 'Bearer'
		});

		const jars = [1, 2, 3].map(() => makeCookies({ 'refresh-token': 'shared-refresh' }));
		const results = await Promise.all(jars.map((c) => manager.validateAndRefreshToken(c)));

		expect(results).toEqual(['refreshed', 'refreshed', 'refreshed']);
		expect(authApi.refreshToken).toHaveBeenCalledOnce();
		// Every jar gets the new tokens, not just the one that did the work.
		for (const jar of jars) {
			expect(jar._store['access-token'].value).toBe('new-access');
		}
	});

	it("does not let one user's refresh satisfy another user's request", async () => {
		const { authApi } = await import('$lib/server/trenara/auth');
		vi.mocked(authApi.refreshToken).mockImplementation(async ({ refresh_token }) => ({
			access_token: `access-for-${refresh_token}`,
			refresh_token: `next-${refresh_token}`,
			expires_in: 86400,
			token_type: 'Bearer'
		}));

		const a = makeCookies({ 'refresh-token': 'user-a' });
		const b = makeCookies({ 'refresh-token': 'user-b' });

		await Promise.all([manager.validateAndRefreshToken(a), manager.validateAndRefreshToken(b)]);

		expect(a._store['access-token'].value).toBe('access-for-user-a');
		expect(b._store['access-token'].value).toBe('access-for-user-b');
	});
});

// ─────────────────────────────────────────────────────────────
// setIdentityCookies
// ─────────────────────────────────────────────────────────────
describe('setIdentityCookies', () => {
	it('stores id, signature and email as long-lived httpOnly cookies', async () => {
		const { SESSION_COOKIE_MAX_AGE } = await import('./token-manager');
		const cookies = makeCookies();

		manager.setIdentityCookies(cookies, { id: 42, email: 'user@example.com' });

		expect(cookies._store.user_id.value).toBe('42');
		expect(cookies._store.user_id_sig.value).toBe('sig-42');
		expect(cookies._store.user_email.value).toBe('user@example.com');
		for (const key of ['user_id', 'user_id_sig', 'user_email']) {
			expect(cookies._store[key].options.httpOnly).toBe(true);
			expect(cookies._store[key].options.maxAge).toBe(SESSION_COOKIE_MAX_AGE);
		}
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
			user_id_sig: 'sig-42',
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
			'user_id_sig',
			'user_email',
			'trenara_session'
		]) {
			expect(cookies._store[key]).toBeUndefined();
		}
	});
});
