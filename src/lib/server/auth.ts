import type { Cookies } from '@sveltejs/kit';
export enum TokenType {
	AccessToken = "access-token", 
	RefreshToken = "refresh-token"
}

export function setSessionTokenCookie(cookies: Cookies, token: string, tokenType: TokenType, expiresAt: Date) {
	cookies.set(tokenType.toString(), token, {
		expires: expiresAt,
		path: '/',
		httpOnly: true,
		secure: true,
		sameSite: 'strict'
	});
}

export function getSessionTokenCookie(cookies: Cookies, tokenType: TokenType) {
	return cookies.get(tokenType.toString());
}

export function deleteSessionTokenCookie(cookies: Cookies, tokenType: TokenType) {
	cookies.delete(tokenType.toString(), {
		path: '/',
		httpOnly: true,
		secure: true,
		sameSite: 'strict'
	});
}
