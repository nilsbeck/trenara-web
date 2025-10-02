# Database Setup for Prediction Tracking

This directory contains the database setup for the prediction tracking feature using Vercel Postgres.

## Files Overview

- `connection.ts` - Database connection utility with error handling
- `migrations.ts` - Database migration system and schema definitions
- `init.ts` - Database initialization utilities
- `prediction-history.ts` - Data access layer for prediction history
- `test.ts` - Database setup testing utilities
- `index.ts` - Central export point for all database utilities

## Setup Instructions

### 1. Environment Variables

The following environment variables are required for Vercel Postgres:

```env
POSTGRES_URL=""
POSTGRES_PRISMA_URL=""
POSTGRES_URL_NO_SSL=""
POSTGRES_URL_NON_POOLING=""
POSTGRES_USER=""
POSTGRES_HOST=""
POSTGRES_PASSWORD=""
POSTGRES_DATABASE=""
```

### 2. Local Development

For local development, you'll need to:

1. Create a Vercel Postgres database in your Vercel dashboard
2. Copy the connection strings to your `.env` file
3. The database will be automatically initialized when the server starts

### 3. Production Deployment

In production on Vercel, these environment variables are automatically set when you add a Vercel Postgres database to your project.

## Database Schema

### prediction_history Table

```sql
CREATE TABLE prediction_history (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    predicted_time VARCHAR(20) NOT NULL,  -- Format: "HH:MM:SS"
    predicted_pace VARCHAR(20) NOT NULL,  -- Format: "MM:SS min/km"
    recorded_at DATE NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, recorded_at)  -- Prevent duplicate entries for same day
);

-- Indexes for efficient querying
CREATE INDEX idx_prediction_history_user_date ON prediction_history(user_id, recorded_at);
CREATE INDEX idx_prediction_history_user_created ON prediction_history(user_id, created_at);
```

## Usage

### Basic Database Operations

```typescript
import { db } from '$lib/server/database';

// Execute a query
const results = await db.query('SELECT * FROM prediction_history WHERE user_id = $1', [userId]);

// Execute a single query
const result = await db.queryOne('SELECT * FROM prediction_history WHERE id = $1', [id]);
```

### Prediction History Operations

```typescript
import { predictionHistoryDAO } from '$lib/server/database';

// Get user's prediction history
const history = await predictionHistoryDAO.getUserPredictionHistory(userId);

// Store prediction if values changed
const record = await predictionHistoryDAO.storeIfChanged(userId, "1:30:00", "4:15 min/km");

// Check if values have changed
const hasChanged = await predictionHistoryDAO.hasValuesChanged(userId, "1:30:00", "4:15 min/km");
```

## Testing

In development mode, you can test the database setup by visiting:
`/api/v0/database-test`

This endpoint will verify:
- Database connection
- Schema setup
- Table accessibility
- Basic DAO operations

## Error Handling

The database layer includes comprehensive error handling:

- `DatabaseError` - Base database error class
- `ConnectionError` - Connection-related errors
- `QueryError` - Query execution errors

All errors include the original error for debugging purposes.

## Migration System

The migration system ensures database schema is properly set up:

- Migrations are tracked in a `migrations` table
- Each migration has a unique ID and description
- Migrations are idempotent (safe to run multiple times)
- New migrations can be added to the `allMigrations` array

## Performance Considerations

- Indexes are created for efficient querying by user and date
- Connection pooling is handled by Vercel Postgres
- Queries use parameterized statements to prevent SQL injection
- The `storeIfChanged` method prevents redundant data storage
