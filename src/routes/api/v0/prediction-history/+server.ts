import { json, type RequestEvent } from '@sveltejs/kit';
import { getSessionTokenCookie, TokenType } from '$lib/server/auth';
import { userApi } from '$lib/server/api';
import { predictionHistoryDAO, ValidationError, type CreatePredictionHistoryData } from '$lib/server/database/prediction-history';
import { QueryError, ConnectionError } from '$lib/server/database/connection';
import { ApiResponseError, handleError, logError } from '$lib/utils/error-handling';
import { dev } from '$app/environment';
import { dev } from '$app/environment';

/**
 * GET /api/v0/prediction-history
 * Retrieve user's prediction history
 */
export const GET = async (event: RequestEvent) => {
	try {
		// Check authentication
		const accessToken = getSessionTokenCookie(event.cookies, TokenType.AccessToken);
		if (!accessToken) {
			return json({ 
				error: 'Authentication required',
				code: 'AUTH_REQUIRED'
			}, { status: 401 });
		}

		// Get current user to extract user_id
		let user;
		try {
			user = await userApi.getCurrentUser(event.cookies);
		} catch (userError) {
			logError(userError, 'GET /api/v0/prediction-history - user fetch');
			return json({ 
				error: 'Failed to authenticate user',
				code: 'AUTH_FAILED'
			}, { status: 401 });
		}

		if (!user || !user.id) {
			return json({ 
				error: 'User not found',
				code: 'USER_NOT_FOUND'
			}, { status: 404 });
		}

		// Check database health first
		const dbStatus = await predictionHistoryDAO.getDatabaseStatus();
		if (!dbStatus.isAvailable) {
			logError(new Error(dbStatus.message), 'GET /api/v0/prediction-history - database unavailable');
			return json({
				error: 'Prediction tracking is temporarily unavailable',
				code: 'DATABASE_UNAVAILABLE',
				records: [], // Return empty array as fallback
				fallback: true
			}, { status: 503 });
		}

		// Parse query parameters for optimized loading
		const url = new URL(event.request.url);
		const startDate = url.searchParams.get('start_date');
		const endDate = url.searchParams.get('end_date');
		const limitParam = url.searchParams.get('limit');
		const limit = limitParam ? parseInt(limitParam, 10) : undefined;

		// Retrieve prediction history with optimization options
		const history = await predictionHistoryDAO.getUserPredictionHistory(user.id, {
			startDate: startDate || undefined,
			endDate: endDate || undefined,
			limit: limit && limit > 0 ? limit : undefined
		});

		return json({
			records: history,
			count: history.length,
			user_id: user.id,
			database_status: 'healthy',
			cached_until: new Date(Date.now() + 5 * 60 * 1000).toISOString() // 5 minutes
		});

	} catch (error) {
		logError(error, 'GET /api/v0/prediction-history');
		
		if (error instanceof QueryError) {
			return json({ 
				error: 'Database query failed',
				code: 'QUERY_ERROR',
				records: [],
				fallback: true
			}, { status: 500 });
		}

		if (error instanceof ConnectionError) {
			return json({ 
				error: 'Database connection failed',
				code: 'CONNECTION_ERROR',
				records: [],
				fallback: true
			}, { status: 503 });
		}
		
		if (error instanceof ApiResponseError) {
			return json({ 
				error: error.message,
				code: 'API_ERROR'
			}, { status: error.status });
		}

		// Return fallback response for any unexpected errors
		return json({ 
			error: 'Unable to load prediction history',
			code: 'INTERNAL_ERROR',
			records: [], // Provide fallback empty data
			fallback: true
		}, { status: 500 });
	}
};

/**
 * POST /api/v0/prediction-history
 * Store new prediction data
 */
export const POST = async (event: RequestEvent) => {
	try {
		// Check authentication
		const accessToken = getSessionTokenCookie(event.cookies, TokenType.AccessToken);
		if (!accessToken) {
			return json({ 
				error: 'Authentication required',
				code: 'AUTH_REQUIRED'
			}, { status: 401 });
		}

		// Get current user to extract user_id
		let user;
		try {
			user = await userApi.getCurrentUser(event.cookies);
		} catch (userError) {
			logError(userError, 'POST /api/v0/prediction-history - user fetch');
			return json({ 
				error: 'Failed to authenticate user',
				code: 'AUTH_FAILED'
			}, { status: 401 });
		}

		if (!user || !user.id) {
			return json({ 
				error: 'User not found',
				code: 'USER_NOT_FOUND'
			}, { status: 404 });
		}

		// Parse request body
		let requestData;
		try {
			requestData = await event.request.json();
		} catch (parseError) {
			return json({ 
				error: 'Invalid JSON in request body',
				code: 'INVALID_JSON'
			}, { status: 400 });
		}

		const { predicted_time, predicted_pace, recorded_at } = requestData;

		if (dev) {
			console.log('POST /api/v0/prediction-history - Request data:', {
				userId: user.id,
				predicted_time,
				predicted_pace,
				recorded_at
			});
		}

		// Validate required fields
		if (!predicted_time || !predicted_pace) {
			return json({ 
				error: 'Missing required fields: predicted_time and predicted_pace are required',
				code: 'MISSING_FIELDS',
				required_fields: ['predicted_time', 'predicted_pace']
			}, { status: 400 });
		}

		// Check database health first
		const dbStatus = await predictionHistoryDAO.getDatabaseStatus();
		if (!dbStatus.isAvailable) {
			logError(new Error(dbStatus.message), 'POST /api/v0/prediction-history - database unavailable');
			return json({
				error: 'Prediction tracking is temporarily unavailable',
				code: 'DATABASE_UNAVAILABLE',
				stored: false,
				fallback: true
			}, { status: 503 });
		}

		// Store prediction data (only if values have changed)
		const result = await predictionHistoryDAO.storeIfChanged(
			user.id,
			predicted_time,
			predicted_pace
		);

		if (dev) {
			console.log('POST /api/v0/prediction-history - Storage result:', {
				userId: user.id,
				stored: !!result,
				result: result ? { id: result.id, recorded_at: result.recorded_at } : null
			});
		}

		if (!result) {
			// Values haven't changed, return success but indicate no storage
			return json({
				message: 'Prediction values unchanged, no new record created',
				stored: false,
				code: 'NO_CHANGE'
			});
		}

		return json({
			message: 'Prediction stored successfully',
			stored: true,
			record: result,
			code: 'SUCCESS'
		}, { status: 201 });

	} catch (error) {
		console.error('POST /api/v0/prediction-history - Detailed error:', {
			message: error instanceof Error ? error.message : 'Unknown error',
			stack: error instanceof Error ? error.stack : 'No stack trace',
			name: error instanceof Error ? error.name : 'Unknown',
			type: typeof error
		});
		
		logError(error, 'POST /api/v0/prediction-history');
		
		if (error instanceof ValidationError) {
			return json({ 
				error: error.message,
				field: error.field,
				code: 'VALIDATION_ERROR'
			}, { status: 400 });
		}

		if (error instanceof QueryError) {
			return json({ 
				error: 'Database query failed',
				code: 'QUERY_ERROR',
				stored: false,
				fallback: true
			}, { status: 500 });
		}

		if (error instanceof ConnectionError) {
			return json({ 
				error: 'Database connection failed',
				code: 'CONNECTION_ERROR',
				stored: false,
				fallback: true
			}, { status: 503 });
		}

		if (error instanceof ApiResponseError) {
			return json({ 
				error: error.message,
				code: 'API_ERROR'
			}, { status: error.status });
		}

		// Return graceful fallback for any unexpected errors
		return json({ 
			error: 'Unable to store prediction data',
			code: 'INTERNAL_ERROR',
			stored: false,
			fallback: true
		}, { status: 500 });
	}
};
