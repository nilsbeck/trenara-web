import type { Handle } from '@sveltejs/kit';
import * as auth from '$lib/server/auth.js';

const handleAuth: Handle = async ({ event, resolve }) => {
	const sessionToken = event.cookies.get(auth.TokenType.AccessToken);
	if (!sessionToken) {
		event.locals.user = null;
		event.locals.session = null;
		return resolve(event);
	}
	
	event.locals.user = "user";

	return resolve(event);
};

export const handle: Handle = handleAuth;
