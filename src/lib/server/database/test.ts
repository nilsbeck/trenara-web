/**
 * Database setup test utility
 * Used to verify database connection and schema setup
 */

import { initializeDatabase, db, predictionHistoryDAO } from './index.js';
import { dev } from '$app/environment';

/**
 * Test database setup and basic operations
 */
export async function testDatabaseSetup(): Promise<{
    success: boolean;
    message: string;
    details?: any;
}> {
    try {
        // Test 1: Initialize database
        await initializeDatabase();
        
        // Test 2: Test basic connection
        const connectionTest = await db.testConnection();
        if (!connectionTest) {
            return {
                success: false,
                message: 'Database connection test failed'
            };
        }

        // Test 3: Test table exists by querying it
        try {
            await db.query('SELECT COUNT(*) FROM prediction_history LIMIT 1');
        } catch (error) {
            return {
                success: false,
                message: 'Prediction history table not accessible',
                details: error instanceof Error ? error.message : error
            };
        }

        // Test 4: Test DAO operations (if we have environment variables set)
        let daoTestResult = 'Skipped (no database URL configured)';
        
        if (process.env.POSTGRES_URL) {
            try {
                // Test getting history for a non-existent user (should return empty array)
                const history = await predictionHistoryDAO.getUserPredictionHistory(999999);
                daoTestResult = `DAO test passed (returned ${history.length} records)`;
            } catch (error) {
                return {
                    success: false,
                    message: 'DAO operations test failed',
                    details: error instanceof Error ? error.message : error
                };
            }
        }

        return {
            success: true,
            message: 'Database setup completed successfully',
            details: {
                connectionTest: 'Passed',
                schemaSetup: 'Passed',
                tableAccess: 'Passed',
                daoTest: daoTestResult
            }
        };

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        
        if (dev) {
            console.error('Database setup test failed:', error);
        }

        return {
            success: false,
            message: `Database setup failed: ${errorMessage}`,
            details: error
        };
    }
}
