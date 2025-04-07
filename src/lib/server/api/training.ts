import { TokenType } from '../auth';
import { getSessionTokenCookie } from '../auth';
import { apiClient } from './config';
import { ApiResponseError, handleError, logError } from '$lib/utils/error-handling';
import type {
	Goal,
	NutritionAdvice,
	Schedule,
	TestScheduleResponse,
	SaveScheduleResponse,
	AddEntryResponse
} from './types';
import type { Cookies } from '@sveltejs/kit';

export const trainingApi = {
	// async getTrainingPlans(cookies: Cookies): Promise<TrainingPlan[]> {
	//     const response = await apiClient.getAxios().get<TrainingPlan[]>('/api/training/plans', {
	//         headers: {
	//             'Authorization': `Bearer ${getSessionTokenCookie(cookies, TokenType.AccessToken)}`
	//         }
	//     });
	//     return response.data;
	// },

	// async getTrainingPlan(cookies: Cookies, id: number): Promise<TrainingPlan> {
	//     const response = await apiClient.getAxios().get<TrainingPlan>(`/api/training/plans/${id}`);
	//     return response.data;
	// },

	// async getTrainingSessions(cookies: Cookies, planId: number): Promise<TrainingSession[]> {
	//     const response = await apiClient.getAxios().get<TrainingSession[]>(`/api/training/plans/${planId}/sessions`, {
	//         headers: {
	//             'Authorization': `Bearer ${getSessionTokenCookie(cookies, TokenType.AccessToken)}`
	//         }
	//     });
	//     return response.data;
	// },

	async getGoal(cookies: Cookies): Promise<Goal> {
		try {
			const response = await apiClient.getAxios().get<Goal>(`/api/goal`, {
				headers: {
					Authorization: `Bearer ${getSessionTokenCookie(cookies, TokenType.AccessToken)}`
				}
			});
			return response.data;
		} catch (error) {
			logError(error, 'getGoal');
			throw handleError(error);
		}
	},

	async getNutrition(cookies: Cookies, timestamp: string): Promise<NutritionAdvice> {
		try {
			const response = await apiClient
				.getAxios()
				.get<NutritionAdvice>(`api/nutritional/advice?date=${timestamp}`, {
					headers: {
						Authorization: `Bearer ${getSessionTokenCookie(cookies, TokenType.AccessToken)}`
					}
				});

			if (!response.data) {
				throw new ApiResponseError('No nutrition data found', 404);
			}

			return response.data;
		} catch (error) {
			logError(error, 'getNutrition');
			throw handleError(error);
		}
	},

	async getSchedule(cookies: Cookies, timestamp: number): Promise<Schedule> {
		try {
			const response = await apiClient
				.getAxios()
				.get<Schedule>(`/api/schedule/week/?timestamp=${timestamp}`, {
					headers: {
						Authorization: `Bearer ${getSessionTokenCookie(cookies, TokenType.AccessToken)}`
					}
				});

			if (!response.data) {
				throw new ApiResponseError('No schedule data found', 404);
			}

			return response.data;
		} catch (error) {
			logError(error, 'getSchedule');
			throw handleError(error);
		}
	},

	async putFeedback(cookies: Cookies, entryId: number, feedback: number) {
		try {
			const response = await apiClient.getAxios().put(
				`/api/entries/${entryId}/rpe`,
				{ rpe: feedback },
				{
					headers: {
						Authorization: `Bearer ${getSessionTokenCookie(cookies, TokenType.AccessToken)}`
					}
				}
			);

			return response.data;
		} catch (error) {
			logError(error, 'putFeedback');
			throw handleError(error);
		}
	},

	async testChangeDate(
		cookies: Cookies,
		entryId: number,
		date: Date,
		includeFuture: boolean
	): Promise<TestScheduleResponse> {
		try {
			const response = await apiClient.getAxios().put(
				`/api/schedule/trainings/${entryId}/change_test`,
				{
					action: 'move',
					include_future: includeFuture,
					target_date: date
				},
				{
					headers: {
						Authorization: `Bearer ${getSessionTokenCookie(cookies, TokenType.AccessToken)}`
					}
				}
			);

			if (!response.data) {
				throw new ApiResponseError('Failed to test date change', 400);
			}

			return response.data;
		} catch (error) {
			logError(error, 'testChangeDate');
			throw handleError(error);
		}
	},

	async saveChangeDate(
		cookies: Cookies,
		entryId: number,
		date: Date,
		includeFuture: boolean
	): Promise<SaveScheduleResponse> {
		try {
			const response = await apiClient.getAxios().put(
				`/api/schedule/trainings/${entryId}/change_save`,
				{
					action: 'move',
					include_future: includeFuture,
					target_date: date
				},
				{
					headers: {
						Authorization: `Bearer ${getSessionTokenCookie(cookies, TokenType.AccessToken)}`
					}
				}
			);

			if (!response.data) {
				throw new ApiResponseError('Failed to save date change', 400);
			}

			return response.data;
		} catch (error) {
			logError(error, 'saveChangeDate');
			throw handleError(error);
		}
	},

	async addTraining(
		cookies: Cookies,
		name: string,
		timeInSeconds: number,
		date: string,
		distanceInKm: number
	): Promise<AddEntryResponse> {
		try {
			const response = await apiClient.getAxios().post(
				`/api/entries`,
				{
					name: name,
					time_in_sec: timeInSeconds,
					start_time: date,
					distance_value: distanceInKm,
					distance_unit: 'km'
				},
				{
					headers: {
						Authorization: `Bearer ${getSessionTokenCookie(cookies, TokenType.AccessToken)}`
					}
				}
			);

			if (!response.data) {
				throw new ApiResponseError('Failed to add training', 400);
			}

			return response.data;
		} catch (error) {
			logError(error, 'addTraining');
			throw handleError(error);
		}
	},

	async deleteTraining(
		cookies: Cookies,
		trainingId: number
	): Promise<AddEntryResponse> {
		try {
			const response = await apiClient.getAxios().delete(
				`/api/entries/${trainingId}`,
				{
					headers: {
						Authorization: `Bearer ${getSessionTokenCookie(cookies, TokenType.AccessToken)}`
					}
				}
			);

			if (!response.data) {
				throw new ApiResponseError('Failed to delete training', 400);
			}

			return response.data;
		} catch (error) {
			logError(error, 'deleteTraining');
			throw handleError(error);
		}
	}
};
