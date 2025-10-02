/**
 * Unit tests for prediction history data access layer
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
	PredictionValidator, 
	ValidationError, 
	PredictionHistoryDAO,
	type CreatePredictionHistoryData,
	type PredictionHistoryRecord
} from './prediction-history.js';
import { db } from './connection.js';

// Mock the database connection
vi.mock('./connection.js', () => ({
	db: {
		query: vi.fn(),
		queryOne: vi.fn(),
		queryWithRetry: vi.fn(),
		queryOneWithRetry: vi.fn(),
		isAvailable: vi.fn()
	},
	QueryError: class QueryError extends Error {
		constructor(message: string, query?: string, originalError?: Error) {
			super(message);
			this.name = 'QueryError';
		}
	},
	ConnectionError: class ConnectionError extends Error {
		constructor(message: string, originalError?: Error) {
			super(message);
			this.name = 'ConnectionError';
		}
	}
}));

describe('PredictionValidator', () => {
	describe('validateTimeFormat', () => {
		it('should validate correct time formats', () => {
			expect(PredictionValidator.validateTimeFormat('1:23:45')).toBe(true);
			expect(PredictionValidator.validateTimeFormat('0:00:00')).toBe(true);
			expect(PredictionValidator.validateTimeFormat('23:59:59')).toBe(true);
			expect(PredictionValidator.validateTimeFormat('12:30:15')).toBe(true);
		});

		it('should reject invalid time formats', () => {
			expect(PredictionValidator.validateTimeFormat('1:23')).toBe(false);
			expect(PredictionValidator.validateTimeFormat('1:23:60')).toBe(false);
			expect(PredictionValidator.validateTimeFormat('24:00:00')).toBe(false);
			expect(PredictionValidator.validateTimeFormat('1:60:00')).toBe(false);
			expect(PredictionValidator.validateTimeFormat('abc:def:ghi')).toBe(false);
			expect(PredictionValidator.validateTimeFormat('')).toBe(false);
		});
	});

	describe('validatePaceFormat', () => {
		it('should validate correct pace formats', () => {
			expect(PredictionValidator.validatePaceFormat('4:30 min/km')).toBe(true);
			expect(PredictionValidator.validatePaceFormat('0:00 min/km')).toBe(true);
			expect(PredictionValidator.validatePaceFormat('99:59 min/km')).toBe(true);
			expect(PredictionValidator.validatePaceFormat('5:15 min/km')).toBe(true);
		});

		it('should reject invalid pace formats', () => {
			expect(PredictionValidator.validatePaceFormat('4:30')).toBe(false);
			expect(PredictionValidator.validatePaceFormat('4:60 min/km')).toBe(false);
			expect(PredictionValidator.validatePaceFormat('100:00 min/km')).toBe(false);
			expect(PredictionValidator.validatePaceFormat('4:30 min/mile')).toBe(false);
			expect(PredictionValidator.validatePaceFormat('abc:def min/km')).toBe(false);
			expect(PredictionValidator.validatePaceFormat('')).toBe(false);
		});
	});

	describe('validateUserId', () => {
		it('should validate correct user IDs', () => {
			expect(PredictionValidator.validateUserId(1)).toBe(true);
			expect(PredictionValidator.validateUserId(123)).toBe(true);
			expect(PredictionValidator.validateUserId(999999)).toBe(true);
		});

		it('should reject invalid user IDs', () => {
			expect(PredictionValidator.validateUserId(0)).toBe(false);
			expect(PredictionValidator.validateUserId(-1)).toBe(false);
			expect(PredictionValidator.validateUserId(1.5)).toBe(false);
			expect(PredictionValidator.validateUserId(NaN)).toBe(false);
		});
	});

	describe('validateDateFormat', () => {
		it('should validate correct date formats', () => {
			expect(PredictionValidator.validateDateFormat('2024-01-15')).toBe(true);
			expect(PredictionValidator.validateDateFormat('2023-12-31')).toBe(true);
			expect(PredictionValidator.validateDateFormat('2025-02-10')).toBe(true);
		});

		it('should reject invalid date formats', () => {
			expect(PredictionValidator.validateDateFormat('2024-1-15')).toBe(false);
			expect(PredictionValidator.validateDateFormat('24-01-15')).toBe(false);
			expect(PredictionValidator.validateDateFormat('2024/01/15')).toBe(false);
			expect(PredictionValidator.validateDateFormat('2024-13-01')).toBe(false);
			expect(PredictionValidator.validateDateFormat('2024-01-32')).toBe(false);
			expect(PredictionValidator.validateDateFormat('')).toBe(false);
		});
	});

	describe('validatePredictionData', () => {
		it('should validate correct prediction data', () => {
			const validData: CreatePredictionHistoryData = {
				user_id: 123,
				predicted_time: '1:23:45',
				predicted_pace: '4:30 min/km',
				recorded_at: '2024-01-15'
			};

			expect(() => PredictionValidator.validatePredictionData(validData)).not.toThrow();
		});

		it('should validate data without recorded_at', () => {
			const validData: CreatePredictionHistoryData = {
				user_id: 123,
				predicted_time: '1:23:45',
				predicted_pace: '4:30 min/km'
			};

			expect(() => PredictionValidator.validatePredictionData(validData)).not.toThrow();
		});

		it('should throw ValidationError for invalid user_id', () => {
			const invalidData: CreatePredictionHistoryData = {
				user_id: -1,
				predicted_time: '1:23:45',
				predicted_pace: '4:30 min/km'
			};

			expect(() => PredictionValidator.validatePredictionData(invalidData))
				.toThrow(ValidationError);
		});

		it('should throw ValidationError for invalid time format', () => {
			const invalidData: CreatePredictionHistoryData = {
				user_id: 123,
				predicted_time: 'invalid',
				predicted_pace: '4:30 min/km'
			};

			expect(() => PredictionValidator.validatePredictionData(invalidData))
				.toThrow(ValidationError);
		});

		it('should throw ValidationError for invalid pace format', () => {
			const invalidData: CreatePredictionHistoryData = {
				user_id: 123,
				predicted_time: '1:23:45',
				predicted_pace: 'invalid'
			};

			expect(() => PredictionValidator.validatePredictionData(invalidData))
				.toThrow(ValidationError);
		});
	});

	describe('timeToSeconds', () => {
		it('should convert time strings to seconds correctly', () => {
			expect(PredictionValidator.timeToSeconds('1:23:45')).toBe(5025); // 1*3600 + 23*60 + 45
			expect(PredictionValidator.timeToSeconds('0:00:00')).toBe(0);
			expect(PredictionValidator.timeToSeconds('2:30:15')).toBe(9015); // 2*3600 + 30*60 + 15
		});

		it('should throw ValidationError for invalid time format', () => {
			expect(() => PredictionValidator.timeToSeconds('invalid'))
				.toThrow(ValidationError);
		});
	});

	describe('paceToSecondsPerKm', () => {
		it('should convert pace strings to seconds per km correctly', () => {
			expect(PredictionValidator.paceToSecondsPerKm('4:30 min/km')).toBe(270); // 4*60 + 30
			expect(PredictionValidator.paceToSecondsPerKm('0:00 min/km')).toBe(0);
			expect(PredictionValidator.paceToSecondsPerKm('5:15 min/km')).toBe(315); // 5*60 + 15
		});

		it('should throw ValidationError for invalid pace format', () => {
			expect(() => PredictionValidator.paceToSecondsPerKm('invalid'))
				.toThrow(ValidationError);
		});
	});

	describe('secondsToTime', () => {
		it('should convert seconds to time strings correctly', () => {
			expect(PredictionValidator.secondsToTime(5025)).toBe('1:23:45');
			expect(PredictionValidator.secondsToTime(0)).toBe('0:00:00');
			expect(PredictionValidator.secondsToTime(9015)).toBe('2:30:15');
		});
	});

	describe('secondsPerKmToPace', () => {
		it('should convert seconds per km to pace strings correctly', () => {
			expect(PredictionValidator.secondsPerKmToPace(270)).toBe('4:30 min/km');
			expect(PredictionValidator.secondsPerKmToPace(0)).toBe('0:00 min/km');
			expect(PredictionValidator.secondsPerKmToPace(315)).toBe('5:15 min/km');
		});
	});
});

describe('PredictionHistoryDAO', () => {
	let dao: PredictionHistoryDAO;
	const mockDb = vi.mocked(db);

	beforeEach(() => {
		dao = PredictionHistoryDAO.getInstance();
		vi.clearAllMocks();
	});

	describe('getLatestPrediction', () => {
		it('should return the latest prediction for a user', async () => {
			const mockRecord: PredictionHistoryRecord = {
				id: 1,
				user_id: 123,
				predicted_time: '1:23:45',
				predicted_pace: '4:30 min/km',
				recorded_at: '2024-01-15',
				created_at: '2024-01-15T10:00:00Z'
			};

			mockDb.queryOneWithRetry.mockResolvedValue(mockRecord);

			const result = await dao.getLatestPrediction(123);

			expect(result).toEqual(mockRecord);
			expect(mockDb.queryOneWithRetry).toHaveBeenCalledWith(
				expect.stringContaining('ORDER BY recorded_at DESC'),
				[123]
			);
		});

		it('should return null when no prediction exists', async () => {
			mockDb.queryOneWithRetry.mockResolvedValue(null);

			const result = await dao.getLatestPrediction(123);

			expect(result).toBeNull();
		});
	});

	describe('getUserPredictionHistory', () => {
		it('should return all predictions for a user ordered by date', async () => {
			const mockRecords: PredictionHistoryRecord[] = [
				{
					id: 1,
					user_id: 123,
					predicted_time: '1:25:00',
					predicted_pace: '4:35 min/km',
					recorded_at: '2024-01-10',
					created_at: '2024-01-10T10:00:00Z'
				},
				{
					id: 2,
					user_id: 123,
					predicted_time: '1:23:45',
					predicted_pace: '4:30 min/km',
					recorded_at: '2024-01-15',
					created_at: '2024-01-15T10:00:00Z'
				}
			];

			mockDb.queryWithRetry.mockResolvedValue(mockRecords);

			const result = await dao.getUserPredictionHistory(123);

			expect(result).toEqual(mockRecords);
			expect(mockDb.queryWithRetry).toHaveBeenCalledWith(
				expect.stringContaining('ORDER BY recorded_at ASC'),
				[123]
			);
		});

		it('should return empty array when no predictions exist', async () => {
			mockDb.queryWithRetry.mockResolvedValue([]);

			const result = await dao.getUserPredictionHistory(123);

			expect(result).toEqual([]);
		});
	});

	describe('createPredictionRecord', () => {
		it('should create a new prediction record with valid data', async () => {
			const inputData: CreatePredictionHistoryData = {
				user_id: 123,
				predicted_time: '1:23:45',
				predicted_pace: '4:30 min/km'
			};

			const mockRecord: PredictionHistoryRecord = {
				id: 1,
				user_id: 123,
				predicted_time: '1:23:45',
				predicted_pace: '4:30 min/km',
				recorded_at: '2024-01-15',
				created_at: '2024-01-15T10:00:00Z'
			};

			mockDb.queryOneWithRetry.mockResolvedValue(mockRecord);

			const result = await dao.createPredictionRecord(inputData);

			expect(result).toEqual(mockRecord);
			expect(mockDb.queryOneWithRetry).toHaveBeenCalledWith(
				expect.stringContaining('INSERT INTO prediction_history'),
				expect.arrayContaining([123, '1:23:45', '4:30 min/km'])
			);
		});

		it('should throw ValidationError for invalid data', async () => {
			const invalidData: CreatePredictionHistoryData = {
				user_id: -1,
				predicted_time: 'invalid',
				predicted_pace: '4:30 min/km'
			};

			await expect(dao.createPredictionRecord(invalidData))
				.rejects.toThrow(ValidationError);
		});
	});

	describe('hasValuesChanged', () => {
		it('should return true when no previous record exists', async () => {
			mockDb.queryOneWithRetry.mockResolvedValue(null);

			const result = await dao.hasValuesChanged(123, '1:23:45', '4:30 min/km');

			expect(result).toBe(true);
		});

		it('should return true when time has changed', async () => {
			const mockRecord: PredictionHistoryRecord = {
				id: 1,
				user_id: 123,
				predicted_time: '1:25:00',
				predicted_pace: '4:30 min/km',
				recorded_at: '2024-01-15',
				created_at: '2024-01-15T10:00:00Z'
			};

			mockDb.queryOneWithRetry.mockResolvedValue(mockRecord);

			const result = await dao.hasValuesChanged(123, '1:23:45', '4:30 min/km');

			expect(result).toBe(true);
		});

		it('should return true when pace has changed', async () => {
			const mockRecord: PredictionHistoryRecord = {
				id: 1,
				user_id: 123,
				predicted_time: '1:23:45',
				predicted_pace: '4:35 min/km',
				recorded_at: '2024-01-15',
				created_at: '2024-01-15T10:00:00Z'
			};

			mockDb.queryOneWithRetry.mockResolvedValue(mockRecord);

			const result = await dao.hasValuesChanged(123, '1:23:45', '4:30 min/km');

			expect(result).toBe(true);
		});

		it('should return false when values are unchanged', async () => {
			const mockRecord: PredictionHistoryRecord = {
				id: 1,
				user_id: 123,
				predicted_time: '1:23:45',
				predicted_pace: '4:30 min/km',
				recorded_at: '2024-01-15',
				created_at: '2024-01-15T10:00:00Z'
			};

			mockDb.queryOneWithRetry.mockResolvedValue(mockRecord);

			const result = await dao.hasValuesChanged(123, '1:23:45', '4:30 min/km');

			expect(result).toBe(false);
		});
	});

	describe('storeIfChanged', () => {
		it('should store data when values have changed', async () => {
			const mockLatestRecord: PredictionHistoryRecord = {
				id: 1,
				user_id: 123,
				predicted_time: '1:25:00',
				predicted_pace: '4:35 min/km',
				recorded_at: '2024-01-10',
				created_at: '2024-01-10T10:00:00Z'
			};

			const mockNewRecord: PredictionHistoryRecord = {
				id: 2,
				user_id: 123,
				predicted_time: '1:23:45',
				predicted_pace: '4:30 min/km',
				recorded_at: '2024-01-15',
				created_at: '2024-01-15T10:00:00Z'
			};

			// First call for hasValuesChanged (getLatestPrediction)
			// Second call for createPredictionRecord
			mockDb.queryOneWithRetry
				.mockResolvedValueOnce(mockLatestRecord)
				.mockResolvedValueOnce(mockNewRecord);

			const result = await dao.storeIfChanged(123, '1:23:45', '4:30 min/km');

			expect(result).toEqual(mockNewRecord);
		});

		it('should return null when values have not changed', async () => {
			const mockRecord: PredictionHistoryRecord = {
				id: 1,
				user_id: 123,
				predicted_time: '1:23:45',
				predicted_pace: '4:30 min/km',
				recorded_at: '2024-01-15',
				created_at: '2024-01-15T10:00:00Z'
			};

			mockDb.queryOneWithRetry.mockResolvedValue(mockRecord);

			const result = await dao.storeIfChanged(123, '1:23:45', '4:30 min/km');

			expect(result).toBeNull();
		});
	});

	describe('getDatabaseStatus', () => {
		it('should return healthy status when database is available', async () => {
			mockDb.isAvailable.mockResolvedValue(true);

			const result = await dao.getDatabaseStatus();

			expect(result.isAvailable).toBe(true);
			expect(result.message).toBe('Database connection is healthy');
			expect(result.lastChecked).toBeDefined();
		});

		it('should return unhealthy status when database is unavailable', async () => {
			mockDb.isAvailable.mockResolvedValue(false);

			const result = await dao.getDatabaseStatus();

			expect(result.isAvailable).toBe(false);
			expect(result.message).toBe('Database connection is unavailable');
			expect(result.lastChecked).toBeDefined();
		});

		it('should handle database check errors gracefully', async () => {
			mockDb.isAvailable.mockRejectedValue(new Error('Connection timeout'));

			const result = await dao.getDatabaseStatus();

			expect(result.isAvailable).toBe(false);
			expect(result.message).toContain('Database health check failed');
			expect(result.lastChecked).toBeDefined();
		});
	});
});
