import { parse, serialize } from 'cookie';
import { TokenManager } from './token-manager';
import type { Cookies } from '@sveltejs/kit';

const SESSION_COOKIE_NAME = 'trenara_session';
const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 1 week

export interface SessionData {
    userId: string;
    email: string;
    expiresAt: number;
}

export class SessionManager {
    private static instance: SessionManager;
    private tokenManager: TokenManager;

    private constructor() {
        this.tokenManager = TokenManager.getInstance();
    }

    public static getInstance(): SessionManager {
        if (!SessionManager.instance) {
            SessionManager.instance = new SessionManager();
        }
        return SessionManager.instance;
    }

    createSession(userId: string, email: string): SessionData {
        const expiresAt = Date.now() + SESSION_MAX_AGE * 1000;
        const sessionData = {
            userId,
            email,
            expiresAt
        };
        
        return sessionData;
    }

    getSessionData(cookies: Cookies): SessionData | null {
        const sessionCookie = cookies.get(SESSION_COOKIE_NAME);
        
        if (!sessionCookie) return null;
        
        try {
            const sessionData = JSON.parse(sessionCookie) as SessionData;
            
            if (sessionData.expiresAt < Date.now()) {
                // Session expired, clean it up
                cookies.delete(SESSION_COOKIE_NAME, { path: '/' });
                return null;
            }

            return sessionData;
        } catch {
            // Invalid session data, clean it up
            cookies.delete(SESSION_COOKIE_NAME, { path: '/' });
            return null;
        }
    }

    destroySession(cookies: Cookies) {
        cookies.delete(SESSION_COOKIE_NAME, { path: '/' });
    }
} 
