import type { RequestEvent } from '@sveltejs/kit';

export enum TokenType {
	AccessToken = "access-token", 
	RefreshToken = "refresh-token"
}

export function setSessionTokenCookie(event: RequestEvent, token: string, tokenType: TokenType, expiresAt: Date) {
	event.cookies.set(tokenType.toString(), token, {
		expires: expiresAt,
		path: '/',
		httpOnly: true,
		secure: true,
		sameSite: 'strict'
	});
}

export function getSessionTokenCookie(event: RequestEvent, tokenType: TokenType) {
	return event.cookies.get(tokenType.toString());
}

export function deleteSessionTokenCookie(event: RequestEvent, tokenType: TokenType) {
	event.cookies.delete(tokenType.toString(), {
		path: '/',
		httpOnly: true,
		secure: true,
		sameSite: 'strict'
	});
}
