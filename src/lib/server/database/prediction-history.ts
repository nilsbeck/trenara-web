/**
 * Prediction history data access layer
 * Handles CRUD operations for prediction tracking
 */

import { db, QueryError, ConnectionError } from './connection.js';
import { dev } from '$app/environment';

export interface PredictionHistoryRecord {
    id: number;
    user_id: number;
    predicted_time: string;
    predicted_pace: string;
    recorded_at: string; // ISO date string
    created_at: string;
}

export interface CreatePredictionHistoryData {
    user_id: number;
    predicted_time: string;
    predicted_pace: string;
    recorded_at?: string; // Optional, defaults to today
}

export class ValidationError extends Error {
    constructor(message: string, public field?: string) {
        super(message);
        this.name = 'ValidationError';
    }
}

/**
 * Validation functions for prediction data formats
 */
export class PredictionValidator {
    /**
     * Validate time format (HH:MM:SS)
     */
    public static validateTimeFormat(time: string): boolean {
        const timeRegex = /^([0-9]{1,2}):([0-5][0-9]):([0-5][0-9])$/;
        const match = time.match(timeRegex);
        
        if (!match) {
            return false;
        }

        const hours = parseInt(match[1], 10);
        const minutes = parseInt(match[2], 10);
        const seconds = parseInt(match[3], 10);

        // Basic range validation
        return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59 && seconds >= 0 && seconds <= 59;
    }

    /**
     * Validate pace format (MM:SS min/km)
     */
    public static validatePaceFormat(pace: string): boolean {
        const paceRegex = /^([0-9]{1,2}):([0-5][0-9]) min\/km$/;
        const match = pace.match(paceRegex);
        
        if (!match) {
            return false;
        }

        const minutes = parseInt(match[1], 10);
        const seconds = parseInt(match[2], 10);

        // Basic range validation (reasonable pace limits)
        return minutes >= 0 && minutes <= 99 && seconds >= 0 && seconds <= 59;
    }

    /**
     * Validate user ID
     */
    public static validateUserId(userId: number): boolean {
        return Number.isInteger(userId) && userId > 0;
    }

    /**
     * Validate date format (YYYY-MM-DD)
     */
    public static validateDateFormat(date: string): boolean {
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(date)) {
            return false;
        }

        const parsedDate = new Date(date);
        return parsedDate instanceof Date && !isNaN(parsedDate.getTime());
    }

    /**
     * Validate complete prediction data
     */
    public static validatePredictionData(data: CreatePredictionHistoryData): void {
        if (!this.validateUserId(data.user_id)) {
            throw new ValidationError('Invalid user ID: must be a positive integer', 'user_id');
        }

        if (!this.validateTimeFormat(data.predicted_time)) {
            throw new ValidationError(
                'Invalid time format: must be HH:MM:SS (e.g., "1:23:45")', 
                'predicted_time'
            );
        }

        if (!this.validatePaceFormat(data.predicted_pace)) {
            throw new ValidationError(
                'Invalid pace format: must be MM:SS min/km (e.g., "4:30 min/km")', 
                'predicted_pace'
            );
        }

        if (data.recorded_at && !this.validateDateFormat(data.recorded_at)) {
            throw new ValidationError(
                'Invalid date format: must be YYYY-MM-DD (e.g., "2024-01-15")', 
                'recorded_at'
            );
        }
    }

    /**
     * Convert time string to seconds for calculations
     */
    public static timeToSeconds(time: string): number {
        if (!this.validateTimeFormat(time)) {
            throw new ValidationError('Invalid time format for conversion', 'time');
        }

        const [hours, minutes, seconds] = time.split(':').map(Number);
        return hours * 3600 + minutes * 60 + seconds;
    }

    /**
     * Convert pace string to seconds per km for calculations
     */
    public static paceToSecondsPerKm(pace: string): number {
        if (!this.validatePaceFormat(pace)) {
            throw new ValidationError('Invalid pace format for conversion', 'pace');
        }

        const match = pace.match(/^([0-9]{1,2}):([0-5][0-9]) min\/km$/);
        if (!match) {
            throw new ValidationError('Invalid pace format for conversion', 'pace');
        }

        const minutes = parseInt(match[1], 10);
        const seconds = parseInt(match[2], 10);
        return minutes * 60 + seconds;
    }

    /**
     * Format seconds back to time string (HH:MM:SS)
     */
    public static secondsToTime(totalSeconds: number): string {
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        
        return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    /**
     * Format seconds per km back to pace string (MM:SS min/km)
     */
    public static secondsPerKmToPace(secondsPerKm: number): string {
        const minutes = Math.floor(secondsPerKm / 60);
        const seconds = secondsPerKm % 60;
        
        return `${minutes}:${seconds.toString().padStart(2, '0')} min/km`;
    }
}

/**
 * Data access object for prediction history
 */
export class PredictionHistoryDAO {
    private static instance: PredictionHistoryDAO;

    private constructor() {}

    public static getInstance(): PredictionHistoryDAO {
        if (!PredictionHistoryDAO.instance) {
            PredictionHistoryDAO.instance = new PredictionHistoryDAO();
        }
        return PredictionHistoryDAO.instance;
    }

    /**
     * Get the latest prediction record for a user
     */
    public async getLatestPrediction(userId: number): Promise<PredictionHistoryRecord | null> {
        try {
            const query = `
                SELECT id, user_id, predicted_time, predicted_pace, 
                       recorded_at::text, created_at::text
                FROM prediction_history 
                WHERE user_id = $1 
                ORDER BY recorded_at DESC, created_at DESC 
                LIMIT 1
            `;

            return await db.queryOneWithRetry<PredictionHistoryRecord>(query, [userId]);
        } catch (error) {
            if (dev) {
                console.error(`Failed to get latest prediction for user ${userId}:`, error);
            }
            
            // Return null on database errors to allow graceful degradation
            if (error instanceof QueryError || error instanceof ConnectionError) {
                return null;
            }
            
            throw new QueryError(
                `Failed to get latest prediction for user ${userId}`,
                undefined,
                error instanceof Error ? error : undefined
            );
        }
    }

    /**
     * Get all prediction history for a user, ordered by date
     * Optimized with date range filtering and limit support
     */
    public async getUserPredictionHistory(
        userId: number, 
        options?: {
            startDate?: string;
            endDate?: string;
            limit?: number;
        }
    ): Promise<PredictionHistoryRecord[]> {
        try {
            let query = `
                SELECT id, user_id, predicted_time, predicted_pace, 
                       recorded_at::text, created_at::text
                FROM prediction_history 
                WHERE user_id = $1
            `;
            
            const params: any[] = [userId];
            let paramIndex = 2;
            
            // Add date range filtering for better performance
            if (options?.startDate) {
                query += ` AND recorded_at >= $${paramIndex}`;
                params.push(options.startDate);
                paramIndex++;
            }
            
            if (options?.endDate) {
                query += ` AND recorded_at <= $${paramIndex}`;
                params.push(options.endDate);
                paramIndex++;
            }
            
            query += ` ORDER BY recorded_at ASC, created_at ASC`;
            
            // Add limit for pagination support
            if (options?.limit && options.limit > 0) {
                query += ` LIMIT $${paramIndex}`;
                params.push(options.limit);
            }

            return await db.queryWithRetry<PredictionHistoryRecord>(query, params);
        } catch (error) {
            if (dev) {
                console.error(`Failed to get prediction history for user ${userId}:`, error);
            }
            
            // Return empty array on database errors to allow graceful degradation
            if (error instanceof QueryError || error instanceof ConnectionError) {
                return [];
            }
            
            throw new QueryError(
                `Failed to get prediction history for user ${userId}`,
                undefined,
                error instanceof Error ? error : undefined
            );
        }
    }

    /**
     * Create a new prediction history record
     */
    public async createPredictionRecord(data: CreatePredictionHistoryData): Promise<PredictionHistoryRecord> {
        try {
            // Validate input data
            PredictionValidator.validatePredictionData(data);

            const recordedAt = data.recorded_at || new Date().toISOString().split('T')[0];

            const query = `
                INSERT INTO prediction_history (user_id, predicted_time, predicted_pace, recorded_at)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (user_id, recorded_at) 
                DO UPDATE SET 
                    predicted_time = EXCLUDED.predicted_time,
                    predicted_pace = EXCLUDED.predicted_pace,
                    created_at = NOW()
                RETURNING id, user_id, predicted_time, predicted_pace, 
                          recorded_at::text, created_at::text
            `;

            const result = await db.queryOneWithRetry<PredictionHistoryRecord>(query, [
                data.user_id,
                data.predicted_time,
                data.predicted_pace,
                recordedAt
            ]);

            if (!result) {
                throw new Error('Failed to create prediction record - no result returned');
            }

            if (dev) {
                console.log('Created prediction record:', result);
            }

            return result;
        } catch (error) {
            if (error instanceof ValidationError) {
                throw error;
            }
            
            if (dev) {
                console.error(`Failed to create prediction record for user ${data.user_id}:`, error);
            }
            
            throw new QueryError(
                `Failed to create prediction record for user ${data.user_id}`,
                undefined,
                error instanceof Error ? error : undefined
            );
        }
    }

    /**
     * Check if current predictions differ from the last stored values
     */
    public async hasValuesChanged(
        userId: number, 
        currentTime: string, 
        currentPace: string
    ): Promise<boolean> {
        try {
            const latestRecord = await this.getLatestPrediction(userId);
            
            if (!latestRecord) {
                // No previous record, so values have "changed" (first time)
                return true;
            }

            // Compare current values with last stored values
            const timeChanged = latestRecord.predicted_time !== currentTime;
            const paceChanged = latestRecord.predicted_pace !== currentPace;

            if (dev && (timeChanged || paceChanged)) {
                console.log('Prediction values changed:', {
                    previousTime: latestRecord.predicted_time,
                    currentTime,
                    previousPace: latestRecord.predicted_pace,
                    currentPace,
                    timeChanged,
                    paceChanged
                });
            }

            return timeChanged || paceChanged;
        } catch (error) {
            if (dev) {
                console.error(`Failed to check value changes for user ${userId}:`, error);
            }
            
            // On database errors, assume values have changed to allow tracking to continue
            if (error instanceof QueryError || error instanceof ConnectionError) {
                return true;
            }
            
            throw new QueryError(
                `Failed to check value changes for user ${userId}`,
                undefined,
                error instanceof Error ? error : undefined
            );
        }
    }

    /**
     * Store prediction data only if values have changed
     */
    public async storeIfChanged(
        userId: number,
        predictedTime: string,
        predictedPace: string
    ): Promise<PredictionHistoryRecord | null> {
        try {
            const hasChanged = await this.hasValuesChanged(userId, predictedTime, predictedPace);
            
            if (!hasChanged) {
                if (dev) {
                    console.log('Prediction values unchanged, skipping storage');
                }
                return null;
            }

            return await this.createPredictionRecord({
                user_id: userId,
                predicted_time: predictedTime,
                predicted_pace: predictedPace
            });
        } catch (error) {
            if (dev) {
                console.error(`Failed to store prediction data for user ${userId}:`, error);
            }
            
            throw new QueryError(
                `Failed to store prediction data for user ${userId}`,
                undefined,
                error instanceof Error ? error : undefined
            );
        }
    }

    /**
     * Check database health and return status
     */
    public async getDatabaseStatus(): Promise<{
        isAvailable: boolean;
        message: string;
        lastChecked: string;
    }> {
        const lastChecked = new Date().toISOString();
        
        try {
            // In development without database, return unavailable status
            if (dev && !process.env.POSTGRES_URL) {
                return {
                    isAvailable: false,
                    message: 'Database not configured for development (set POSTGRES_URL in .env)',
                    lastChecked
                };
            }
            
            const isAvailable = await db.isAvailable(2, 500);
            
            return {
                isAvailable,
                message: isAvailable 
                    ? 'Database connection is healthy' 
                    : 'Database connection is unavailable',
                lastChecked
            };
        } catch (error) {
            return {
                isAvailable: false,
                message: `Database health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
                lastChecked
            };
        }
    }

    /**
     * Delete historic prediction data before a goal start date or all data if no goal is set
     * @param userId - The user ID
     * @param goalStartDate - The goal start date (ISO string), or null to delete all data
     * @returns Promise<number> - Number of records deleted
     */
    public async deleteHistoricDataBeforeGoal(
        userId: number, 
        goalStartDate: string | null
    ): Promise<number> {
        try {
            // Validate user ID
            if (!PredictionValidator.validateUserId(userId)) {
                throw new ValidationError('Invalid user ID: must be a positive integer', 'user_id');
            }

            let query: string;
            let params: any[];

            if (goalStartDate === null) {
                // Delete all historic data for user if no goal is set
                query = `
                    DELETE FROM prediction_history 
                    WHERE user_id = $1
                `;
                params = [userId];
                
                if (dev) {
                    console.log(`Deleting all historic prediction data for user ${userId} (no goal set)`);
                }
            } else {
                // Validate goal start date format
                if (!PredictionValidator.validateDateFormat(goalStartDate)) {
                    throw new ValidationError('Invalid goal start date format', 'goalStartDate');
                }

                // Delete data recorded before the goal start date
                query = `
                    DELETE FROM prediction_history 
                    WHERE user_id = $1 AND recorded_at < $2
                `;
                params = [userId, goalStartDate];
                
                if (dev) {
                    console.log(`Deleting historic prediction data for user ${userId} before ${goalStartDate}`);
                }
            }

            const result = await db.queryWithRetry(query, params);
            const deletedCount = result.rowCount || 0;

            if (dev) {
                console.log(`Deleted ${deletedCount} historic prediction records for user ${userId}`);
            }

            return deletedCount;

        } catch (error) {
            if (error instanceof ValidationError) {
                throw error;
            }
            
            if (dev) {
                console.error(`Failed to delete historic data for user ${userId}:`, error);
            }
            
            throw new QueryError(
                `Failed to delete historic prediction data for user ${userId}`,
                undefined,
                error instanceof Error ? error : undefined
            );
        }
    }

    /**
     * Clean up historic data for a user based on their current goal
     * This is a convenience method that fetches the user's goal and cleans up accordingly
     * @param userId - The user ID
     * @param userGoal - The user's current goal object (with start_date), or null if no goal
     * @returns Promise<number> - Number of records deleted
     */
    public async cleanupHistoricDataForGoal(
        userId: number,
        userGoal: { start_date: string } | null
    ): Promise<number> {
        try {
            const goalStartDate = userGoal?.start_date || null;
            return await this.deleteHistoricDataBeforeGoal(userId, goalStartDate);
        } catch (error) {
            if (dev) {
                console.error(`Failed to cleanup historic data for user ${userId}:`, error);
            }
            throw error;
        }
    }
}

// Export singleton instance
export const predictionHistoryDAO = PredictionHistoryDAO.getInstance();
