import { json } from '@sveltejs/kit';
import { TokenManager } from '$lib/server/auth/token-manager';
import { SessionManager } from '$lib/server/auth/session-manager';
import { TokenType } from '$lib/server/auth/types';
import type { RequestHandler } from '@sveltejs/kit';

export const POST: RequestHandler = async ({ request, cookies }) => {
	const { email, password } = await request.json();

	// Debug logging for production
	if (process.env.NODE_ENV === 'production') {
		console.log('Login attempt in production:', {
			email: email ? email.substring(0, 5) + '...' : null,
			hasPassword: !!password
		});
	}

	// Get instances of our managers
	const tokenManager = TokenManager.getInstance();
	const sessionManager = SessionManager.getInstance();

	try {
		// First, authenticate with the original API using TokenManager
		const authResult = await tokenManager.authenticate(email, password);

		// Debug logging for production
		if (process.env.NODE_ENV === 'production') {
			console.log('Authentication result in production:', {
				success: authResult.success,
				hasUser: !!authResult.user,
				hasCookies: !!authResult.cookies
			});
		}

		if (!authResult.success || !authResult.user || !authResult.cookies) {
			if (process.env.NODE_ENV === 'production') {
				console.log('Login failed in production:', {
					success: authResult.success,
					hasUser: !!authResult.user,
					hasCookies: !!authResult.cookies
				});
			}
			return json({ error: 'Invalid credentials' }, { status: 401 });
		}

		// Set the authentication tokens in cookies
		tokenManager.setToken(
			cookies,
			authResult.cookies.access_token,
			TokenType.AccessToken,
			authResult.cookies.expiration
		);
		tokenManager.setToken(
			cookies,
			authResult.cookies.refresh_token,
			TokenType.RefreshToken,
			authResult.cookies.expiration
		);

		// Set user data cookies for session creation (using lax for better compatibility)
		cookies.set('user_id', authResult.user.id, {
			path: '/',
			httpOnly: true,
			secure: process.env.NODE_ENV === 'production',
			sameSite: 'lax',
			expires: authResult.cookies.expiration
		});

		cookies.set('user_email', authResult.user.email, {
			path: '/',
			httpOnly: true,
			secure: process.env.NODE_ENV === 'production',
			sameSite: 'lax',
			expires: authResult.cookies.expiration
		});

		// Create a local session
		const sessionData = sessionManager.createSession(authResult.user.id, authResult.user.email);

		// Set the session cookie using SvelteKit's cookies API (using lax for better compatibility)
		cookies.set('trenara_session', JSON.stringify(sessionData), {
			path: '/',
			httpOnly: true,
			secure: process.env.NODE_ENV === 'production',
			sameSite: 'lax',
			expires: authResult.cookies.expiration
		});

		// Debug logging for production
		if (process.env.NODE_ENV === 'production') {
			console.log('Login successful in production:', {
				userId: sessionData.userId,
				email: sessionData.email,
				expiresAt: new Date(sessionData.expiresAt).toISOString(),
				tokensSet: true,
				sessionSet: true,
				cookiesAfterSet: cookies.getAll().map((c) => ({ name: c.name, hasValue: !!c.value }))
			});
		}

		// Return response
		return json({ message: 'Login successful' });
	} catch (error) {
		console.error('Login error:', error);
		return json({ error: 'Login failed' }, { status: 500 });
	}
};
