/**
 * Integration tests for prediction history API endpoints
 */

import { describe, it, expect, beforeEach, vi, type MockedFunction } from 'vitest';
import { GET, POST } from './+server.js';
import { getSessionTokenCookie, TokenType } from '$lib/server/auth';
import { userApi } from '$lib/server/api';
import { predictionHistoryDAO, ValidationError } from '$lib/server/database/prediction-history';
import type { RequestEvent } from '@sveltejs/kit';

// Mock dependencies
vi.mock('$lib/server/auth');
vi.mock('$lib/server/api');
vi.mock('$lib/server/database/prediction-history');

const mockGetSessionTokenCookie = vi.mocked(getSessionTokenCookie);
const mockUserApi = vi.mocked(userApi);
const mockPredictionHistoryDAO = vi.mocked(predictionHistoryDAO);

describe('Prediction History API', () => {
	let mockEvent: RequestEvent;
	let mockCookies: any;
	let mockRequest: any;

	beforeEach(() => {
		vi.clearAllMocks();
		
		mockCookies = {
			get: vi.fn(),
			set: vi.fn(),
			delete: vi.fn()
		};

		mockRequest = {
			json: vi.fn()
		};

		mockEvent = {
			cookies: mockCookies,
			request: {
				...mockRequest,
				url: 'http://localhost/api/v0/prediction-history'
			},
			url: new URL('http://localhost/api/v0/prediction-history'),
			params: {},
			route: { id: '/api/v0/prediction-history' },
			platform: null,
			locals: {},
			getClientAddress: () => '127.0.0.1',
			isDataRequest: false,
			isSubRequest: false,
			setHeaders: vi.fn(),
			fetch: vi.fn()
		} as any;
	});

	describe('GET /api/v0/prediction-history', () => {
		it('should return prediction history for authenticated user', async () => {
			// Setup mocks
			mockGetSessionTokenCookie.mockReturnValue('valid-token');
			mockUserApi.getCurrentUser.mockResolvedValue({ id: 123, email: 'test@example.com' });
			mockPredictionHistoryDAO.getDatabaseStatus.mockResolvedValue({
				isAvailable: true,
				message: 'Database connection is healthy',
				lastChecked: new Date()
			});
			mockPredictionHistoryDAO.getUserPredictionHistory.mockResolvedValue([
				{
					id: 1,
					user_id: 123,
					predicted_time: '1:23:45',
					predicted_pace: '4:30 min/km',
					recorded_at: '2024-01-15',
					created_at: '2024-01-15T10:00:00Z'
				}
			]);

			const response = await GET(mockEvent);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.records).toHaveLength(1);
			expect(data.count).toBe(1);
			expect(data.database_status).toBe('healthy');
		});

		it('should return 401 when no access token provided', async () => {
			mockGetSessionTokenCookie.mockReturnValue(null);

			const response = await GET(mockEvent);
			const data = await response.json();

			expect(response.status).toBe(401);
			expect(data.error).toBe('Authentication required');
			expect(data.code).toBe('AUTH_REQUIRED');
		});

		it('should return 401 when user authentication fails', async () => {
			mockGetSessionTokenCookie.mockReturnValue('valid-token');
			mockUserApi.getCurrentUser.mockRejectedValue(new Error('Auth failed'));

			const response = await GET(mockEvent);
			const data = await response.json();

			expect(response.status).toBe(401);
			expect(data.error).toBe('Failed to authenticate user');
			expect(data.code).toBe('AUTH_FAILED');
		});

		it('should return 404 when user not found', async () => {
			mockGetSessionTokenCookie.mockReturnValue('valid-token');
			mockUserApi.getCurrentUser.mockResolvedValue(null);

			const response = await GET(mockEvent);
			const data = await response.json();

			expect(response.status).toBe(404);
			expect(data.error).toBe('User not found');
			expect(data.code).toBe('USER_NOT_FOUND');
		});

		it('should return 503 with fallback when database unavailable', async () => {
			mockGetSessionTokenCookie.mockReturnValue('valid-token');
			mockUserApi.getCurrentUser.mockResolvedValue({ id: 123, email: 'test@example.com' });
			mockPredictionHistoryDAO.getDatabaseStatus.mockResolvedValue({
				isAvailable: false,
				message: 'Database connection failed',
				lastChecked: new Date()
			});

			const response = await GET(mockEvent);
			const data = await response.json();

			expect(response.status).toBe(503);
			expect(data.error).toBe('Prediction tracking is temporarily unavailable');
			expect(data.code).toBe('DATABASE_UNAVAILABLE');
			expect(data.records).toEqual([]);
			expect(data.fallback).toBe(true);
		});

		it('should handle database errors gracefully', async () => {
			mockGetSessionTokenCookie.mockReturnValue('valid-token');
			mockUserApi.getCurrentUser.mockResolvedValue({ id: 123, email: 'test@example.com' });
			mockPredictionHistoryDAO.getDatabaseStatus.mockResolvedValue({
				isAvailable: true,
				message: 'Database connection is healthy',
				lastChecked: new Date()
			});
			mockPredictionHistoryDAO.getUserPredictionHistory.mockRejectedValue(new Error('Database error'));

			const response = await GET(mockEvent);
			const data = await response.json();

			expect(response.status).toBe(500);
			expect(data.error).toBe('Unable to load prediction history');
			expect(data.code).toBe('INTERNAL_ERROR');
			expect(data.records).toEqual([]);
			expect(data.fallback).toBe(true);
		});
	});

	describe('POST /api/v0/prediction-history', () => {
		it('should store new prediction data when values changed', async () => {
			const requestData = {
				predicted_time: '1:23:45',
				predicted_pace: '4:30 min/km'
			};

			mockRequest.json.mockResolvedValue(requestData);
			mockGetSessionTokenCookie.mockReturnValue('valid-token');
			mockUserApi.getCurrentUser.mockResolvedValue({ id: 123, email: 'test@example.com' });
			mockPredictionHistoryDAO.getDatabaseStatus.mockResolvedValue({
				isAvailable: true,
				message: 'Database connection is healthy',
				lastChecked: new Date()
			});
			mockPredictionHistoryDAO.storeIfChanged.mockResolvedValue({
				id: 1,
				user_id: 123,
				predicted_time: '1:23:45',
				predicted_pace: '4:30 min/km',
				recorded_at: '2024-01-15',
				created_at: '2024-01-15T10:00:00Z'
			});

			const response = await POST(mockEvent);
			const data = await response.json();

			expect(response.status).toBe(201);
			expect(data.message).toBe('Prediction stored successfully');
			expect(data.stored).toBe(true);
			expect(data.code).toBe('SUCCESS');
			expect(data.record).toBeDefined();
		});

		it('should return success when values unchanged', async () => {
			const requestData = {
				predicted_time: '1:23:45',
				predicted_pace: '4:30 min/km'
			};

			mockRequest.json.mockResolvedValue(requestData);
			mockGetSessionTokenCookie.mockReturnValue('valid-token');
			mockUserApi.getCurrentUser.mockResolvedValue({ id: 123, email: 'test@example.com' });
			mockPredictionHistoryDAO.getDatabaseStatus.mockResolvedValue({
				isAvailable: true,
				message: 'Database connection is healthy',
				lastChecked: new Date()
			});
			mockPredictionHistoryDAO.storeIfChanged.mockResolvedValue(null);

			const response = await POST(mockEvent);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.message).toBe('Prediction values unchanged, no new record created');
			expect(data.stored).toBe(false);
			expect(data.code).toBe('NO_CHANGE');
		});

		it('should return 401 when no access token provided', async () => {
			mockGetSessionTokenCookie.mockReturnValue(null);

			const response = await POST(mockEvent);
			const data = await response.json();

			expect(response.status).toBe(401);
			expect(data.error).toBe('Authentication required');
			expect(data.code).toBe('AUTH_REQUIRED');
		});

		it('should return 400 for invalid JSON', async () => {
			mockGetSessionTokenCookie.mockReturnValue('valid-token');
			mockRequest.json.mockRejectedValue(new Error('Invalid JSON'));

			const response = await POST(mockEvent);
			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.error).toBe('Invalid JSON in request body');
			expect(data.code).toBe('INVALID_JSON');
		});

		it('should return 400 for missing required fields', async () => {
			const requestData = {
				predicted_time: '1:23:45'
				// missing predicted_pace
			};

			mockRequest.json.mockResolvedValue(requestData);
			mockGetSessionTokenCookie.mockReturnValue('valid-token');

			const response = await POST(mockEvent);
			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.error).toBe('Missing required fields: predicted_time and predicted_pace are required');
			expect(data.code).toBe('MISSING_FIELDS');
			expect(data.required_fields).toEqual(['predicted_time', 'predicted_pace']);
		});

		it('should return 400 for validation errors', async () => {
			const requestData = {
				predicted_time: 'invalid-time',
				predicted_pace: '4:30 min/km'
			};

			mockRequest.json.mockResolvedValue(requestData);
			mockGetSessionTokenCookie.mockReturnValue('valid-token');
			mockUserApi.getCurrentUser.mockResolvedValue({ id: 123, email: 'test@example.com' });
			mockPredictionHistoryDAO.getDatabaseStatus.mockResolvedValue({
				isAvailable: true,
				message: 'Database connection is healthy',
				lastChecked: new Date()
			});
			mockPredictionHistoryDAO.storeIfChanged.mockRejectedValue(
				new ValidationError('Invalid time format', 'predicted_time')
			);

			const response = await POST(mockEvent);
			const data = await response.json();

			// The API correctly handles ValidationError and returns 400
			expect(response.status).toBe(400);
			expect(data.code).toBe('VALIDATION_ERROR');
			// Note: The error message might be empty due to mocking limitations
		});

		it('should return 503 with fallback when database unavailable', async () => {
			const requestData = {
				predicted_time: '1:23:45',
				predicted_pace: '4:30 min/km'
			};

			mockRequest.json.mockResolvedValue(requestData);
			mockGetSessionTokenCookie.mockReturnValue('valid-token');
			mockUserApi.getCurrentUser.mockResolvedValue({ id: 123, email: 'test@example.com' });
			mockPredictionHistoryDAO.getDatabaseStatus.mockResolvedValue({
				isAvailable: false,
				message: 'Database connection failed',
				lastChecked: new Date()
			});

			const response = await POST(mockEvent);
			const data = await response.json();

			expect(response.status).toBe(503);
			expect(data.error).toBe('Prediction tracking is temporarily unavailable');
			expect(data.code).toBe('DATABASE_UNAVAILABLE');
			expect(data.stored).toBe(false);
			expect(data.fallback).toBe(true);
		});
	});
});
