import { TokenType } from '../auth';
import { getSessionTokenCookie } from '../auth';
import { apiClient } from './config';
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
		const response = await apiClient.getAxios().get<Goal>(`/api/goal`, {
			headers: {
				Authorization: `Bearer ${getSessionTokenCookie(cookies, TokenType.AccessToken)}`
			}
		});
		return response.data;
	},

	async getNutrition(cookies: Cookies, timestamp: string): Promise<NutritionAdvice> {
		const response = await apiClient
			.getAxios()
			.get<NutritionAdvice>(`api/nutritional/advice?date=${timestamp}`, {
				headers: {
					Authorization: `Bearer ${getSessionTokenCookie(cookies, TokenType.AccessToken)}`
				}
			});

		return response.data;
	},

	async getSchedule(cookies: Cookies, timestamp: number): Promise<Schedule> {
		const response = await apiClient
			.getAxios()
			.get<Schedule>(`/api/schedule/week/?timestamp=${timestamp}`, {
				headers: {
					Authorization: `Bearer ${getSessionTokenCookie(cookies, TokenType.AccessToken)}`
				}
			});
		return response.data;
	},

	async putFeedback(cookies: Cookies, entryId: number, feedback: number) {
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
	},

	async testChangeDate(
		cookies: Cookies,
		entryId: number,
		date: Date,
		includeFuture: boolean
	): Promise<TestScheduleResponse> {
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

		return response.data;
	},

	async saveChangeDate(
		cookies: Cookies,
		entryId: number,
		date: Date,
		includeFuture: boolean
	): Promise<SaveScheduleResponse> {
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

		return response.data;
	},

	async addTraining(
		cookies: Cookies,
		name: string,
		timeInSeconds: number,
		date: string,
		distanceInKm: number
	): Promise<AddEntryResponse> {
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

		return response.data;
	},

	async deleteTraining(
		cookies: Cookies,
		trainingId: number
	): Promise<AddEntryResponse> {
		const response = await apiClient.getAxios().delete(
			`/api/entries/${trainingId}`,
			{
				headers: {
					Authorization: `Bearer ${getSessionTokenCookie(cookies, TokenType.AccessToken)}`
				}
			}
		);

		console.log(response.status);
		return response.data;
	}
};
