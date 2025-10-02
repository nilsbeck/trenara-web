import { json } from '@sveltejs/kit';
import { TokenManager } from '$lib/server/auth/token-manager';
import { SessionManager } from '$lib/server/auth/session-manager';
import type { RequestHandler } from '@sveltejs/kit';

export const POST: RequestHandler = async ({ request }) => {
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
        const sessionCookie = sessionManager.createSession(
            authResult.user.id,
            authResult.user.email
        );
        
        // Return response with session cookie
        return json(
            { message: 'Login successful' },
            {
                headers: {
                    'Set-Cookie': sessionCookie
                }
            }
        );
    } catch (error) {
        console.error('Login error:', error);
        return json({ error: 'Login failed' }, { status: 500 });
    }
} 
