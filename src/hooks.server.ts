import type { Handle } from '@sveltejs/kit';
import { TokenManager } from '$lib/server/auth/token-manager';
import { verifyUserId } from '$lib/server/auth/user-identity';

const tokenManager = TokenManager.getInstance();

const handleAuth: Handle = async ({ event, resolve }) => {
	const accessToken = event.cookies.get('access-token');

	if (!accessToken) {
		event.locals.user = null;
		return resolve(event);
	}

	// Validate and potentially refresh the token
	const isValid = await tokenManager.validateAndRefreshToken(event.cookies);

	if (!isValid) {
		event.locals.user = null;
		return resolve(event);
	}

	// Verify user identity via HMAC signature stored at login.
	// This prevents IDOR: an attacker who modifies the user_id cookie cannot
	// produce a valid signature without the server-side SESSION_SECRET, so
	// the tampered value is rejected here with no extra API call.
	const userIdStr = event.cookies.get('user_id');
	const userIdSig = event.cookies.get('user_id_sig');
	const userEmail = event.cookies.get('user_email');

	if (userIdStr && userIdSig && userEmail && verifyUserId(userIdStr, userIdSig)) {
		event.locals.user = { id: Number(userIdStr), email: userEmail };
	} else {
		event.locals.user = null;
	}

	const response = await resolve(event);

	response.headers.set(
		'Content-Security-Policy',
		"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; connect-src 'self' https://backend-prod.trenara.com; font-src 'self'; frame-ancestors 'none'"
	);

	return response;
};

export const handle = handleAuth;
