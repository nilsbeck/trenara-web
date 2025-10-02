import { json } from '@sveltejs/kit';
import { TokenManager } from '$lib/server/auth/token-manager';
import { SessionManager } from '$lib/server/auth/session-manager';
import type { RequestHandler } from '@sveltejs/kit';

export const POST: RequestHandler = async ({ request, cookies }) => {
    // Get instances of our managers
    const tokenManager = TokenManager.getInstance();
    const sessionManager = SessionManager.getInstance();
    
    try {
        // Destroy local session
        sessionManager.destroySession(cookies);
        
        // Logout from original API if needed
        await tokenManager.logout(cookies);
        
        // Return response
        return json({ message: 'Logout successful' });
    } catch (error) {
        console.error('Logout error:', error);
        return json({ error: 'Logout failed' }, { status: 500 });
    }
} 
