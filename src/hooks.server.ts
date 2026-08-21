import type { Handle } from '@sveltejs/kit';
import { TokenManager } from '$lib/server/auth/token-manager';
import { verifyUserId } from '$lib/server/auth/user-identity';
import { userApi } from '$lib/server/trenara/user';

const tokenManager = TokenManager.getInstance();

const handleAuth: Handle = async ({ event, resolve }) => {
	event.locals.user = null;

	// Nothing to restore — an anonymous visitor, not an expired session.
	if (!tokenManager.hasSessionCookies(event.cookies)) {
		return resolve(event);
	}

	const status = await tokenManager.validateAndRefreshToken(event.cookies);

	if (status === 'invalid') {
		await tokenManager.logout(event.cookies);
		return resolve(event);
	}

	// The auth API was unreachable. The session is probably still fine, so the
	// cookies are left alone; this one request is just served unauthenticated.
	if (status === 'unavailable') {
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

		// Slide the identity cookies forward whenever the tokens are renewed so
		// they never expire out from under a session that is still in use.
		if (status === 'refreshed') {
			tokenManager.setIdentityCookies(event.cookies, event.locals.user);
		}

		return resolve(event);
	}

	// The identity cookies are missing, expired or unsigned (for example a
	// session created before signing existed, or after SESSION_SECRET was
	// rotated). The tokens are still good, so rebuild the identity from the API
	// rather than throwing the user back to the login screen.
	try {
		const user = await userApi.getCurrentUser(event.cookies);
		tokenManager.setIdentityCookies(event.cookies, { id: user.id, email: user.email });
		event.locals.user = { id: user.id, email: user.email };
	} catch {
		await tokenManager.logout(event.cookies);
	}

	return resolve(event);
};

export const handle = handleAuth;
