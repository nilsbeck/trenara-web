/**
 * Database connection utility for Vercel Postgres
 * Provides connection management with proper error handling
 */

import { dev } from '$app/environment';

// Ensure environment variables are loaded in development
if (dev) {
    try {
        const dotenv = await import('dotenv');
        dotenv.config();
    } catch (error) {
        console.warn('Could not load dotenv:', error);
    }
}

// Use different database clients based on environment
let sql: any;
let pool: any;
let useNativePg = false;

if (dev && process.env.POSTGRES_URL && !process.env.POSTGRES_URL.includes('supabase')) {
    // Use native pg with connection pool for local development
    useNativePg = true;
    const { Pool } = await import('pg');
    pool = new Pool({
        connectionString: process.env.POSTGRES_URL,
        max: 5, // Maximum number of connections
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
    });
} else {
    // Use Vercel Postgres for production - it handles SSL automatically
    useNativePg = false;
    const vercelPg = await import('@vercel/postgres');
    sql = vercelPg.sql;
    
    console.log('Using Vercel Postgres client for production');
}

export class DatabaseError extends Error {
    constructor(message: string, public originalError?: Error) {
        super(message);
        this.name = 'DatabaseError';
    }
}

export class ConnectionError extends DatabaseError {
    constructor(message: string, originalError?: Error) {
        super(message, originalError);
        this.name = 'ConnectionError';
    }
}

export class QueryError extends DatabaseError {
    constructor(message: string, public query?: string, originalError?: Error) {
        super(message, originalError);
        this.name = 'QueryError';
    }
}

/**
 * Database connection manager
 */
export class DatabaseConnection {
    private static instance: DatabaseConnection;

    private constructor() {}

    public static getInstance(): DatabaseConnection {
        if (!DatabaseConnection.instance) {
            DatabaseConnection.instance = new DatabaseConnection();
        }
        return DatabaseConnection.instance;
    }

    /**
     * Execute a SQL query with error handling
     */
    public async query<T = any>(queryText: string, params: any[] = []): Promise<T[]> {
        try {
            if (dev) {
                console.log('Executing query:', queryText, 'with params:', params);
            }

            let result;
            
            if (useNativePg) {
                // Use native pg pool for local development
                try {
                    const pgResult = await pool.query(queryText, params);
                    result = { rows: pgResult.rows };
                } catch (pgError) {
                    if (dev) {
                        console.error('PostgreSQL query failed:', pgError);
                        console.error('Connection string exists:', !!process.env.POSTGRES_URL);
                    }
                    throw new ConnectionError(
                        `PostgreSQL query failed: ${pgError instanceof Error ? pgError.message : 'Unknown error'}`,
                        pgError instanceof Error ? pgError : undefined
                    );
                }
            } else {
                // Use Vercel Postgres for production - handles SSL automatically
                result = await sql.query(queryText, params);
            }
            
            return result.rows as T[];
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown database error';
            
            if (dev) {
                console.error('Database query error:', errorMessage);
                console.error('Query:', queryText);
                console.error('Params:', params);
            }

            // Check for connection-related errors
            if (errorMessage.includes('connection') || errorMessage.includes('timeout') || errorMessage.includes('fetch failed')) {
                throw new ConnectionError(
                    `Database connection failed: ${errorMessage}`,
                    error instanceof Error ? error : undefined
                );
            }

            throw new QueryError(
                `Query execution failed: ${errorMessage}`,
                queryText,
                error instanceof Error ? error : undefined
            );
        }
    }

    /**
     * Execute a SQL query and return the first row
     */
    public async queryOne<T = any>(queryText: string, params: any[] = []): Promise<T | null> {
        const results = await this.query<T>(queryText, params);
        return results.length > 0 ? results[0] : null;
    }

    /**
     * Test database connection
     */
    public async testConnection(): Promise<boolean> {
        try {
            console.log('Testing database connection...');
            console.log('Environment variables check:');
            console.log('- POSTGRES_URL exists:', !!process.env.POSTGRES_URL);
            console.log('- SUPABASE_URL exists:', !!process.env.SUPABASE_URL);
            console.log('- Using native PG:', useNativePg);
            
            if (!process.env.POSTGRES_URL && !process.env.SUPABASE_URL) {
                console.error('No database connection string found');
                return false;
            }
            
            await this.query('SELECT 1 as test');
            console.log('✅ Database connection successful');
            return true;
        } catch (error) {
            console.error('❌ Database connection test failed:', error);
            if (error instanceof Error) {
                console.error('Error details:', {
                    message: error.message,
                    name: error.name,
                    stack: error.stack?.split('\n').slice(0, 3).join('\n')
                });
            }
            return false;
        }
    }

    /**
     * Check if database is available with retry logic
     */
    public async isAvailable(maxRetries: number = 3, retryDelay: number = 1000): Promise<boolean> {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const isConnected = await this.testConnection();
                if (isConnected) {
                    return true;
                }
            } catch (error) {
                if (dev) {
                    console.warn(`Database availability check attempt ${attempt}/${maxRetries} failed:`, error);
                }
            }

            if (attempt < maxRetries) {
                await new Promise(resolve => setTimeout(resolve, retryDelay));
            }
        }

        return false;
    }

    /**
     * Execute query with connection retry logic
     */
    public async queryWithRetry<T = any>(
        queryText: string, 
        params: any[] = [], 
        maxRetries: number = 2
    ): Promise<T[]> {
        let lastError: Error | undefined;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return await this.query<T>(queryText, params);
            } catch (error) {
                lastError = error instanceof Error ? error : new Error('Unknown error');
                
                if (dev) {
                    console.warn(`Query attempt ${attempt}/${maxRetries} failed:`, lastError.message);
                }

                // Only retry on connection-related errors
                if (error instanceof ConnectionError && attempt < maxRetries) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    continue;
                }

                throw error;
            }
        }

        throw lastError || new Error('Query failed after retries');
    }

    /**
     * Execute single row query with connection retry logic
     */
    public async queryOneWithRetry<T = any>(
        queryText: string, 
        params: any[] = [], 
        maxRetries: number = 2
    ): Promise<T | null> {
        const results = await this.queryWithRetry<T>(queryText, params, maxRetries);
        return results.length > 0 ? results[0] : null;
    }

    /**
     * Execute multiple queries in a transaction
     */
    public async transaction<T>(queries: Array<{ query: string; params?: any[] }>): Promise<T[]> {
        try {
            // Begin transaction
            await this.query('BEGIN');
            
            const results: T[] = [];
            
            // Execute all queries
            for (const { query, params = [] } of queries) {
                const result = await this.query<T>(query, params);
                results.push(result as T);
            }
            
            // Commit transaction
            await this.query('COMMIT');
            
            return results;
        } catch (error) {
            // Rollback on error
            try {
                await this.query('ROLLBACK');
            } catch (rollbackError) {
                if (dev) {
                    console.error('Transaction rollback failed:', rollbackError);
                }
            }
            
            throw error;
        }
    }
}

// Export singleton instance
export const db = DatabaseConnection.getInstance();
