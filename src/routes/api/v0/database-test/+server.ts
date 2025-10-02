/**
 * Database test endpoint
 * Used to verify database setup in development
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { testDatabaseSetup } from '$lib/server/database/test.js';
import { dev } from '$app/environment';

export const GET: RequestHandler = async () => {
    // Only allow in development mode
    if (!dev) {
        return json(
            { error: 'Database test endpoint only available in development' },
            { status: 403 }
        );
    }

    try {
        const testResult = await testDatabaseSetup();
        
        return json(testResult, {
            status: testResult.success ? 200 : 500
        });
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        
        return json(
            {
                success: false,
                message: `Database test failed: ${errorMessage}`,
                details: error
            },
            { status: 500 }
        );
    }
};
