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

    createSession(userId: string, email: string): string {
        const expiresAt = Date.now() + SESSION_MAX_AGE * 1000;
        const sessionData = {
            userId,
            email,
            expiresAt
        };
        
        return serialize(SESSION_COOKIE_NAME, JSON.stringify(sessionData), {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/',
            maxAge: SESSION_MAX_AGE
        });
    }

    getSessionData(cookieHeader: string | null, cookies: Cookies): SessionData | null {
        if (!cookieHeader) return null;
        
        const parsedCookies = parse(cookieHeader);
        const sessionCookie = parsedCookies[SESSION_COOKIE_NAME];
        
        if (!sessionCookie) return null;
        
        try {
            const sessionData = JSON.parse(sessionCookie) as SessionData;
            
            if (sessionData.expiresAt < Date.now()) {
                return null;
            }

            return sessionData;
        } catch {
            return null;
        }
    }

    destroySession() {
        return serialize(SESSION_COOKIE_NAME, 'deleted', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/',
            maxAge: 0
        });
    }
} 
