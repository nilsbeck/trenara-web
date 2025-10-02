/**
 * Database migrations for prediction tracking feature
 */

import { db, DatabaseError } from './connection.js';
import { dev } from '$app/environment';

export interface Migration {
    id: string;
    description: string;
    up: () => Promise<void>;
    down: () => Promise<void>;
}

/**
 * Migration manager for database schema changes
 */
export class MigrationManager {
    private static instance: MigrationManager;

    private constructor() {}

    public static getInstance(): MigrationManager {
        if (!MigrationManager.instance) {
            MigrationManager.instance = new MigrationManager();
        }
        return MigrationManager.instance;
    }

    /**
     * Initialize migrations table if it doesn't exist
     */
    private async initializeMigrationsTable(): Promise<void> {
        const createMigrationsTable = `
            CREATE TABLE IF NOT EXISTS migrations (
                id VARCHAR(255) PRIMARY KEY,
                description TEXT NOT NULL,
                executed_at TIMESTAMP DEFAULT NOW()
            )
        `;

        await db.query(createMigrationsTable);
    }

    /**
     * Check if a migration has been executed
     */
    private async isMigrationExecuted(migrationId: string): Promise<boolean> {
        const result = await db.queryOne<{ id: string }>(
            'SELECT id FROM migrations WHERE id = $1',
            [migrationId]
        );
        return result !== null;
    }

    /**
     * Record a migration as executed
     */
    private async recordMigration(migrationId: string, description: string): Promise<void> {
        await db.query(
            'INSERT INTO migrations (id, description) VALUES ($1, $2)',
            [migrationId, description]
        );
    }

    /**
     * Run a single migration
     */
    public async runMigration(migration: Migration): Promise<void> {
        await this.initializeMigrationsTable();

        if (await this.isMigrationExecuted(migration.id)) {
            if (dev) {
                console.log(`Migration ${migration.id} already executed, skipping`);
            }
            return;
        }

        try {
            if (dev) {
                console.log(`Running migration: ${migration.id} - ${migration.description}`);
            }

            await migration.up();
            await this.recordMigration(migration.id, migration.description);

            if (dev) {
                console.log(`Migration ${migration.id} completed successfully`);
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            throw new DatabaseError(
                `Migration ${migration.id} failed: ${errorMessage}`,
                error instanceof Error ? error : undefined
            );
        }
    }

    /**
     * Run all pending migrations
     */
    public async runMigrations(migrations: Migration[]): Promise<void> {
        for (const migration of migrations) {
            await this.runMigration(migration);
        }
    }
}

/**
 * Migration: Create prediction_history table
 */
export const createPredictionHistoryTable: Migration = {
    id: '001_create_prediction_history_table',
    description: 'Create prediction_history table with proper schema and indexes',
    
    async up() {
        // Create the prediction_history table
        const createTableQuery = `
            CREATE TABLE IF NOT EXISTS prediction_history (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                predicted_time VARCHAR(20) NOT NULL,
                predicted_pace VARCHAR(20) NOT NULL,
                recorded_at DATE NOT NULL,
                created_at TIMESTAMP DEFAULT NOW(),
                UNIQUE(user_id, recorded_at)
            )
        `;

        await db.query(createTableQuery);

        // Create index for efficient querying by user and date
        const createIndexQuery = `
            CREATE INDEX IF NOT EXISTS idx_prediction_history_user_date 
            ON prediction_history(user_id, recorded_at)
        `;

        await db.query(createIndexQuery);

        // Create index for efficient querying by user and creation time
        const createCreatedAtIndexQuery = `
            CREATE INDEX IF NOT EXISTS idx_prediction_history_user_created 
            ON prediction_history(user_id, created_at)
        `;

        await db.query(createCreatedAtIndexQuery);
    },

    async down() {
        // Drop indexes first
        await db.query('DROP INDEX IF EXISTS idx_prediction_history_user_created');
        await db.query('DROP INDEX IF EXISTS idx_prediction_history_user_date');
        
        // Drop the table
        await db.query('DROP TABLE IF EXISTS prediction_history');
    }
};

// Export migration manager instance
export const migrationManager = MigrationManager.getInstance();

/**
 * Migration: Add optimized indexes for better performance
 */
export const addOptimizedIndexes: Migration = {
    id: '002_add_optimized_indexes',
    description: 'Add optimized indexes for better query performance',
    
    async up() {
        // Additional index for latest prediction queries (most common operation)
        const createLatestIndexQuery = `
            CREATE INDEX IF NOT EXISTS idx_prediction_history_user_latest 
            ON prediction_history(user_id, recorded_at DESC, created_at DESC)
        `;
        await db.query(createLatestIndexQuery);

        // Partial index for recent data (last 6 months) for faster queries
        const createRecentIndexQuery = `
            CREATE INDEX IF NOT EXISTS idx_prediction_history_recent 
            ON prediction_history(user_id, recorded_at) 
            WHERE recorded_at >= CURRENT_DATE - INTERVAL '6 months'
        `;
        await db.query(createRecentIndexQuery);

        // Composite index for date range queries
        const createDateRangeIndexQuery = `
            CREATE INDEX IF NOT EXISTS idx_prediction_history_date_range 
            ON prediction_history(recorded_at, user_id) 
            WHERE recorded_at >= CURRENT_DATE - INTERVAL '1 year'
        `;
        await db.query(createDateRangeIndexQuery);
    },

    async down() {
        await db.query('DROP INDEX IF EXISTS idx_prediction_history_date_range');
        await db.query('DROP INDEX IF EXISTS idx_prediction_history_recent');
        await db.query('DROP INDEX IF EXISTS idx_prediction_history_user_latest');
    }
};

// Export all migrations
export const allMigrations: Migration[] = [
    createPredictionHistoryTable,
    addOptimizedIndexes
];
