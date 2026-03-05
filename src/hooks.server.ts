import type { Handle } from '@sveltejs/kit';
import { TokenManager } from '$lib/server/auth/token-manager';

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

	// Set user data from cookies
	const userId = event.cookies.get('user_id');
	const userEmail = event.cookies.get('user_email');

	if (userId && userEmail) {
		event.locals.user = { id: userId, email: userEmail };
	} else {
		event.locals.user = null;
	}

	return resolve(event);
};

export const handle = handleAuth;
