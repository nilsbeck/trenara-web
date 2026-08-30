import type { Cookies } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { TokenType } from './types';
import { authApi } from '$lib/server/trenara/auth';
import { HttpError } from '$lib/server/trenara/client';
import type { AuthResponse } from '$lib/server/trenara/types';

/**
 * How long the session cookies themselves live in the browser.
 *
 * This is deliberately decoupled from the lifetime of the access token the
 * Trenara API hands out. The access token is short lived and is renewed with
 * the refresh token; if the cookies carrying that refresh token died with the
 * access token, a user who did not open the app before the access token
 * expired would lose the refresh token too and be forced to log in again.
 *
 * Browsers accept up to 400 days. This caps it well short of that: the cookie
 * is a long-lived credential, and 90 days bounds how long a stolen cookie jar
 * stays useful. The window slides on every token refresh, so it is 90 days of
 * *inactivity* that ends a session, not 90 days of use.
 */
export const SESSION_COOKIE_MAX_AGE = 90 * 24 * 60 * 60;

/** Renew the access token once less than this much of its life is left. */
const REFRESH_THRESHOLD_MS = 12 * 60 * 60 * 1000;

/**
 * Successful refreshes are remembered briefly so that requests still carrying
 * the previous (now rotated) refresh token reuse the result instead of
 * presenting a spent token to the API. A PWA typically fires several requests
 * at once when it is reopened, so this window matters in practice.
 */
const REFRESH_RESULT_TTL_MS = 60 * 1000;

/**
 * - `valid`      – the access token can be used as is.
 * - `refreshed`  – the tokens were just renewed and written back to the jar.
 * - `invalid`    – the session is gone for good; the cookies must be cleared.
 * - `unavailable` – the auth API could not be reached. The session may well
 *                   still be good, so the cookies are kept and the request is
 *                   simply treated as unauthenticated.
 */
export type SessionStatus = 'valid' | 'refreshed' | 'invalid' | 'unavailable';

type RefreshOutcome =
	| { status: 'refreshed'; response: AuthResponse }
	| { status: 'invalid' }
	| { status: 'unavailable' };

type RefreshEntry = { outcome: Promise<RefreshOutcome>; settledAt: number };

export class TokenManager {
	private static instance: TokenManager;
	private inFlight = new Map<string, RefreshEntry>();

	private constructor() {}

	static getInstance(): TokenManager {
		if (!TokenManager.instance) {
			TokenManager.instance = new TokenManager();
		}
		return TokenManager.instance;
	}

	/** True when neither token is present, i.e. there is nothing to restore. */
	hasSessionCookies(cookies: Cookies): boolean {
		return Boolean(
			this.getToken(cookies, TokenType.AccessToken) ||
			this.getToken(cookies, TokenType.RefreshToken)
		);
	}

	async validateAndRefreshToken(cookies: Cookies): Promise<SessionStatus> {
		const accessToken = this.getToken(cookies, TokenType.AccessToken);
		const expirationStr = cookies.get(`${TokenType.AccessToken}_expiration`);
		const expiresAt = expirationStr ? Date.parse(expirationStr) : NaN;

		if (accessToken && !Number.isNaN(expiresAt) && expiresAt - REFRESH_THRESHOLD_MS > Date.now()) {
			return 'valid';
		}

		// The access token is missing, expired or about to expire. An expired
		// access token is not the end of the session: the refresh token usually
		// outlives it by a long way, so always give it a chance.
		const refreshTokenValue = this.getToken(cookies, TokenType.RefreshToken);
		if (!refreshTokenValue) {
			return 'invalid';
		}

		return this.refreshToken(cookies, refreshTokenValue);
	}

	private async refreshToken(cookies: Cookies, refreshTokenValue: string): Promise<SessionStatus> {
		const outcome = await this.runRefresh(refreshTokenValue);

		if (outcome.status !== 'refreshed') {
			return outcome.status;
		}

		this.setSessionCookies(cookies, outcome.response);
		return 'refreshed';
	}

	/**
	 * Runs (or joins) a refresh for one specific refresh token. Keyed by the
	 * token rather than a single instance-wide flag so that a refresh for one
	 * user can never be mistaken for a refresh for another on a warm server.
	 */
	private runRefresh(refreshTokenValue: string): Promise<RefreshOutcome> {
		this.pruneRefreshResults();

		const existing = this.inFlight.get(refreshTokenValue);
		if (existing) {
			return existing.outcome;
		}

		const entry: RefreshEntry = { settledAt: 0, outcome: Promise.resolve({ status: 'invalid' }) };
		entry.outcome = this.callRefreshApi(refreshTokenValue).finally(() => {
			entry.settledAt = Date.now();
		});

		this.inFlight.set(refreshTokenValue, entry);
		return entry.outcome;
	}

	private async callRefreshApi(refreshTokenValue: string): Promise<RefreshOutcome> {
		try {
			const response = await authApi.refreshToken({ refresh_token: refreshTokenValue });
			return { status: 'refreshed', response };
		} catch (error) {
			return { status: isAuthRejection(error) ? 'invalid' : 'unavailable' };
		}
	}

	private pruneRefreshResults(): void {
		const cutoff = Date.now() - REFRESH_RESULT_TTL_MS;
		for (const [token, entry] of this.inFlight) {
			if (entry.settledAt && entry.settledAt < cutoff) {
				this.inFlight.delete(token);
			}
		}
	}

	getToken(cookies: Cookies, tokenType: TokenType): string | undefined {
		return cookies.get(tokenType.toString());
	}

	/**
	 * Writes an access/refresh token pair to the jar. `expiresAt` records when
	 * the *token* stops being usable; the cookies themselves are kept for
	 * {@link SESSION_COOKIE_MAX_AGE} so a stale access token can still be
	 * traded in for a fresh one later.
	 */
	setToken(cookies: Cookies, token: string, tokenType: TokenType, expiresAt: Date): void {
		cookies.set(`${tokenType}_expiration`, expiresAt.toISOString(), this.cookieOptions());
		cookies.set(tokenType.toString(), token, this.cookieOptions());
	}

	setSessionCookies(cookies: Cookies, response: AuthResponse): void {
		// `expires_in` describes the access token. The API does not tell us how
		// long the refresh token is good for, so its `_expiration` value is only
		// informational — nothing decides anything from it.
		const expirationDate = new Date(Date.now() + response.expires_in * 1000);
		this.setToken(cookies, response.access_token, TokenType.AccessToken, expirationDate);
		this.setToken(cookies, response.refresh_token, TokenType.RefreshToken, expirationDate);
	}

	private cookieOptions() {
		return {
			maxAge: SESSION_COOKIE_MAX_AGE,
			expires: new Date(Date.now() + SESSION_COOKIE_MAX_AGE * 1000),
			path: '/' as const,
			httpOnly: true,
			secure: !dev,
			sameSite: 'lax' as const
		};
	}

	/**
	 * Clears a token and the expiry beside it.
	 *
	 * Both go through `cookieOptions()`, the same helper that wrote them. The
	 * two used to be spelled out separately and drifted: the token was deleted
	 * with `httpOnly` and its `_expiration` without, although both were set with
	 * it. Deletion matches on name, path and domain, so nothing was actually
	 * broken — but an asymmetry between how a cookie is written and how it is
	 * cleared is the kind that gets copied somewhere it does matter.
	 */
	deleteToken(cookies: Cookies, tokenType: TokenType): void {
		cookies.delete(tokenType.toString(), this.cookieOptions());
		cookies.delete(`${tokenType}_expiration`, this.cookieOptions());
	}

	async authenticate(
		email: string,
		password: string
	): Promise<{
		success: boolean;
		cookies?: { access_token: string; refresh_token: string; expiration: Date };
	}> {
		try {
			const response: AuthResponse = await authApi.login({
				username: email,
				password
			});

			const currentDate = new Date();
			const expirationDate = new Date(currentDate.getTime() + response.expires_in * 1000);

			return {
				success: true,
				cookies: {
					access_token: response.access_token,
					refresh_token: response.refresh_token,
					expiration: expirationDate
				}
			};
		} catch {
			return { success: false };
		}
	}

	async logout(cookies: Cookies): Promise<void> {
		const refreshTokenValue = this.getToken(cookies, TokenType.RefreshToken);
		if (refreshTokenValue) {
			this.inFlight.delete(refreshTokenValue);
		}

		this.deleteToken(cookies, TokenType.AccessToken);
		this.deleteToken(cookies, TokenType.RefreshToken);
		cookies.delete('trenara_session', this.cookieOptions());

		// Identity is resolved from the token now, so nothing writes these any
		// more. They are still cleared, and will be for a while yet: a browser
		// that signed in before the change is holding a set, and logout is the
		// one moment this app is certain to be able to take them back.
		for (const legacy of LEGACY_IDENTITY_COOKIES) {
			cookies.delete(legacy, this.cookieOptions());
		}
	}
}

/**
 * Cookies an earlier version of this app used to carry the signed user id.
 *
 * Kept only so `logout` can clear them; nothing reads or writes them.
 */
const LEGACY_IDENTITY_COOKIES = ['user_id', 'user_id_sig', 'user_email'] as const;

/**
 * Only a refusal by the auth server means the session is really over. Network
 * trouble, timeouts and 5xx responses must not cost the user their session.
 */
function isAuthRejection(error: unknown): boolean {
	return error instanceof HttpError && error.status >= 400 && error.status < 500;
}
