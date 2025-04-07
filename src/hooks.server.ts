import type { Handle } from '@sveltejs/kit';
import { TokenManager } from '$lib/server/auth/token-manager';

const handleAuth: Handle = async ({ event, resolve }) => {
	const tokenManager = TokenManager.getInstance();
	
	// Check if we have a valid session token
	const isValidSession = await tokenManager.validateAndRefreshToken(event.cookies);
	
	if (!isValidSession) {
		event.locals.user = null;
		return resolve(event);
	}

	event.locals.user = 'user';
	return resolve(event);
};

export const handle = handleAuth;
