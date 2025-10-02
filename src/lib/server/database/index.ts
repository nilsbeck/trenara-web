/**
 * Database module exports
 * Central export point for all database utilities
 */

// Connection utilities
export { 
    db, 
    DatabaseConnection, 
    DatabaseError, 
    ConnectionError, 
    QueryError 
} from './connection.js';

// Migration utilities
export { 
    migrationManager, 
    allMigrations, 
    createPredictionHistoryTable,
    type Migration 
} from './migrations.js';

// Initialization utilities
export { 
    initializeDatabase, 
    ensureDatabaseInitialized 
} from './init.js';

// Prediction history data access
export { 
    predictionHistoryDAO, 
    PredictionHistoryDAO,
    PredictionValidator,
    ValidationError,
    type PredictionHistoryRecord,
    type CreatePredictionHistoryData 
} from './prediction-history.js';
