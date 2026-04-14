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
		await tokenManager.logout(event.cookies);
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
		// Sig missing or invalid (e.g. existing session predates this change).
		// Clear the entire session so the login page doesn't redirect back to
		// the app, which would cause an infinite redirect loop.
		await tokenManager.logout(event.cookies);
		event.locals.user = null;
	}

	return resolve(event);
};

export const handle = handleAuth;
