import type { Handle } from '@sveltejs/kit';
import { TokenManager } from '$lib/server/auth/token-manager';
import { userApi } from '$lib/server/trenara';

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

	// Derive user identity from the access token via the Trenara API to prevent
	// IDOR: reading user_id from a client-controllable cookie would allow an
	// authenticated attacker to access another user's data by spoofing the cookie.
	try {
		const user = await userApi.getCurrentUser(event.cookies);
		event.locals.user = { id: user.id, email: user.email };
	} catch {
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
