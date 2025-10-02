import { json } from '@sveltejs/kit';
import { TokenManager } from '$lib/server/auth/token-manager';
import { SessionManager } from '$lib/server/auth/session-manager';
import type { RequestHandler } from '@sveltejs/kit';

export const POST: RequestHandler = async ({ request, cookies }) => {
    const { email, password } = await request.json();
    
    // Get instances of our managers
    const tokenManager = TokenManager.getInstance();
    const sessionManager = SessionManager.getInstance();
    
    try {
        // First, authenticate with the original API using TokenManager
        const authResult = await tokenManager.authenticate(email, password);
        
        if (!authResult.success || !authResult.user) {
            return json({ error: 'Invalid credentials' }, { status: 401 });
        }
        
        // Create a local session
        const sessionData = sessionManager.createSession(
            authResult.user.id,
            authResult.user.email
        );
        
        // Set the session cookie using SvelteKit's cookies API
        cookies.set('trenara_session', JSON.stringify(sessionData), {
            path: '/',
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 60 * 60 * 24 * 7 // 7 days
        });

        // Debug logging for production
        if (process.env.NODE_ENV === 'production') {
            console.log('Login session created in production:', {
                userId: sessionData.userId,
                email: sessionData.email,
                expiresAt: new Date(sessionData.expiresAt).toISOString(),
                cookieSet: true
            });
        }
        
        // Return response
        return json({ message: 'Login successful' });
    } catch (error) {
        console.error('Login error:', error);
        return json({ error: 'Login failed' }, { status: 500 });
    }
} 
