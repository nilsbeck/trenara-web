import { createHmac, timingSafeEqual } from 'crypto';
import { SESSION_SECRET } from '$env/static/private';

/**
 * Sign a user ID with the server-side SESSION_SECRET.
 * The signature is stored alongside the user_id cookie so that any
 * client-side tampering with the user_id value is detectable without
 * requiring an extra API call on every request.
 */
export function signUserId(userId: number): string {
	return createHmac('sha256', SESSION_SECRET).update(String(userId)).digest('hex');
}

/**
 * Verify that a user ID cookie value matches its stored signature.
 * Uses a timing-safe comparison to prevent timing attacks.
 */
export function verifyUserId(userId: string, signature: string): boolean {
	try {
		const expected = createHmac('sha256', SESSION_SECRET).update(userId).digest('hex');
		const expectedBuf = Buffer.from(expected, 'hex');
		const actualBuf = Buffer.from(signature, 'hex');
		if (expectedBuf.length !== actualBuf.length) return false;
		return timingSafeEqual(expectedBuf, actualBuf);
	} catch {
		return false;
	}
}
