/**
 * API endpoint for cleaning up historic prediction data
 * DELETE /api/v0/prediction-history/cleanup
 */

import { json, type RequestEvent } from '@sveltejs/kit';
import { getSessionTokenCookie, TokenType } from '$lib/server/auth';
import { userApi } from '$lib/server/api';
import { predictionHistoryDAO, ValidationError } from '$lib/server/database/prediction-history';
import { QueryError, ConnectionError } from '$lib/server/database/connection';
import { ApiResponseError, handleError, logError } from '$lib/utils/error-handling';
import { dev } from '$app/environment';

export const DELETE = async (event: RequestEvent) => {
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
			logError(userError, 'DELETE /api/v0/prediction-history/cleanup - user fetch');
			return json({ 
				error: 'Authentication required',
				code: 'AUTH_REQUIRED'
			}, { status: 401 });
		}

		// Check database health first
		const dbStatus = await predictionHistoryDAO.getDatabaseStatus();
		if (!dbStatus.isAvailable) {
			logError(new Error(dbStatus.message), 'DELETE /api/v0/prediction-history/cleanup - database unavailable');
			return json({
				error: 'Prediction data cleanup is temporarily unavailable',
				code: 'DATABASE_UNAVAILABLE',
				deleted: 0
			}, { status: 503 });
		}

		// Get user's current goal to determine cleanup strategy
		let userGoal = null;
		try {
			userGoal = await userApi.getUserStats(event.cookies);
			// Extract goal from user stats if available
			userGoal = (userGoal as any)?.goal || null;
		} catch (error) {
			// If we can't get the goal, we'll treat it as no goal set
			if (dev) {
				console.log('Could not fetch user goal for cleanup, treating as no goal set:', error);
			}
		}

		if (dev) {
			console.log('DELETE /api/v0/prediction-history/cleanup - Request data:', {
				userId: user.id,
				hasGoal: !!userGoal,
				goalStartDate: userGoal?.start_date || null
			});
		}

		// Clean up historic data based on goal
		const deletedCount = await predictionHistoryDAO.cleanupHistoricDataForGoal(user.id, userGoal);

		if (dev) {
			console.log('DELETE /api/v0/prediction-history/cleanup - Cleanup result:', {
				userId: user.id,
				deletedCount,
				strategy: userGoal ? 'before_goal_start' : 'all_data'
			});
		}

		return json({
			success: true,
			deleted: deletedCount,
			message: userGoal 
				? `Deleted ${deletedCount} prediction records before goal start date`
				: `Deleted ${deletedCount} prediction records (no active goal)`,
			strategy: userGoal ? 'before_goal_start' : 'all_data'
		});

	} catch (error) {
		if (error instanceof ValidationError) {
			return json({ 
				error: error.message,
				code: 'VALIDATION_ERROR',
				field: error.field,
				deleted: 0
			}, { status: 400 });
		}

		if (error instanceof QueryError) {
			return json({ 
				error: 'Database query failed',
				code: 'QUERY_ERROR',
				deleted: 0
			}, { status: 500 });
		}

		if (error instanceof ConnectionError) {
			return json({ 
				error: 'Database connection failed',
				code: 'CONNECTION_ERROR',
				deleted: 0
			}, { status: 503 });
		}

		// Handle other errors
		logError(error, 'DELETE /api/v0/prediction-history/cleanup');
		
		return json({
			error: 'Failed to cleanup prediction history',
			code: 'INTERNAL_ERROR',
			deleted: 0
		}, { status: 500 });
	}
};
