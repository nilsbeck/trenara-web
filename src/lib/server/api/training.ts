import { TokenType } from '../auth';
import { getSessionTokenCookie } from '../auth';
import { apiClient } from './config';
import type { TrainingPlan, TrainingSession, Goal } from './types';
import type { Cookies } from '@sveltejs/kit';

export const trainingApi = {
async getTrainingPlans(cookies: Cookies): Promise<TrainingPlan[]> {
    const response = await apiClient.getAxios().get<TrainingPlan[]>('/api/training/plans', {
        headers: {
            'Authorization': `Bearer ${getSessionTokenCookie(cookies, TokenType.AccessToken)}`
        }
    });
    return response.data;
},

async getTrainingPlan(cookies: Cookies, id: number): Promise<TrainingPlan> {
    const response = await apiClient.getAxios().get<TrainingPlan>(`/api/training/plans/${id}`);
    return response.data;
},

async getTrainingSessions(cookies: Cookies, planId: number): Promise<TrainingSession[]> {
    const response = await apiClient.getAxios().get<TrainingSession[]>(`/api/training/plans/${planId}/sessions`, {
        headers: {
            'Authorization': `Bearer ${getSessionTokenCookie(cookies, TokenType.AccessToken)}`
        }
    });
    return response.data;
},


async getGoal(cookies: Cookies): Promise<Goal> {
    const response = await apiClient.getAxios().get<Goal>(`/api/goal`, {
        headers: {
            'Authorization': `Bearer ${getSessionTokenCookie(cookies, TokenType.AccessToken)}`
        }
    });
    return response.data;
}
};
