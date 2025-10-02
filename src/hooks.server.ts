import type { Handle } from '@sveltejs/kit';
import { TokenManager } from '$lib/server/auth/token-manager';
import { SessionManager } from '$lib/server/auth/session-manager';
import { ensureDatabaseInitialized } from '$lib/server/database/init.js';

const handleAuth: Handle = async ({ event, resolve }) => {
	const tokenManager = TokenManager.getInstance();
	const sessionManager = SessionManager.getInstance();

	// Initialize database on first request (safe to call multiple times)
	await ensureDatabaseInitialized();

	// Check if we have a valid session
	const sessionData = sessionManager.getSessionData(event.cookies);

	if (sessionData) {
		// We have a valid session, set user data
		event.locals.user = {
			id: sessionData.userId,
			email: sessionData.email
		};
	} else {
		// No valid session, check if we have a valid token
		const isValidSession = await tokenManager.validateAndRefreshToken(event.cookies);

		if (!isValidSession) {
			event.locals.user = null;
			return resolve(event);
		}

		// Get user data from cookies
		const userId = event.cookies.get('user_id');
		const userEmail = event.cookies.get('user_email');

		if (userId && userEmail) {
			// Create a new session
			const sessionData = sessionManager.createSession(userId, userEmail);

			// Set the session cookie
			event.cookies.set('trenara_session', JSON.stringify(sessionData), {
				path: '/',
				httpOnly: true,
				secure: process.env.NODE_ENV === 'production',
				sameSite: 'lax', // Changed from 'strict' to 'lax' for better compatibility
				maxAge: 60 * 60 * 24 * 7 // 7 days
			});

			event.locals.user = {
				id: userId,
				email: userEmail
			};
		} else {
			event.locals.user = null;
		}
	}

	return resolve(event);
};

export const handle = handleAuth;
