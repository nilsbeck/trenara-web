/**
 * Database initialization utility
 * Ensures database schema is set up correctly
 */

// Load environment variables first in development
if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production') {
    try {
        const dotenv = await import('dotenv');
        dotenv.config();
    } catch (error) {
        console.warn('Could not load dotenv in init:', error);
    }
}

import { migrationManager, allMigrations } from './migrations.js';
import { db, ConnectionError } from './connection.js';
import { dev } from '$app/environment';

/**
 * Initialize the database with required schema
 */
export async function initializeDatabase(): Promise<void> {
    try {
        if (dev) {
            console.log('Initializing database...');
        }

        // Test database connection first
        const isConnected = await db.testConnection();
        if (!isConnected) {
            throw new ConnectionError('Unable to connect to database');
        }

        // Run all pending migrations
        await migrationManager.runMigrations(allMigrations);

        if (dev) {
            console.log('Database initialization completed successfully');
        }
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        
        if (dev) {
            console.error('Database initialization failed:', errorMessage);
        }

        // Re-throw the error to be handled by the caller
        throw error;
    }
}

/**
 * Ensure database is initialized (safe to call multiple times)
 */
export async function ensureDatabaseInitialized(): Promise<void> {
    try {
        await initializeDatabase();
    } catch (error) {
        // Log the error but don't throw it to prevent app crashes
        // The specific database operations will handle their own errors
        if (dev) {
            console.warn('Database initialization warning:', error);
            console.warn('Running in development mode without database connection');
            console.warn('To fix this, set up your POSTGRES_URL in .env file');
        }
    }
}
