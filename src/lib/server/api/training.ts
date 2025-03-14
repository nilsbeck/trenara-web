import { TokenType } from '../auth';
import { getSessionTokenCookie } from '../auth';
import { apiClient } from './config';
import type { TrainingPlan, TrainingSession, Goal, NutritionAdvice, Schedule } from './types';
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
		const response = await apiClient.getAxios().put(`/api/entries/${entryId}/rpe`, { rpe: feedback }, {
			headers: {
				Authorization: `Bearer ${getSessionTokenCookie(cookies, TokenType.AccessToken)}`
			}
		});

		return response.data;
	}
};
