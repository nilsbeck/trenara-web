import { TokenType } from '../auth';
import { getSessionTokenCookie } from '../auth';
import { apiClient } from './config';
import type { TrainingPlan, TrainingSession } from './types';
import type { RequestEvent } from '@sveltejs/kit';

export const trainingApi = {
async getTrainingPlans(event: RequestEvent): Promise<TrainingPlan[]> {
    const response = await apiClient.getAxios().get<TrainingPlan[]>('/api/training/plans', {
        headers: {
            'Authorization': `Bearer ${getSessionTokenCookie(event, TokenType.AccessToken)}`
        }
    });
    return response.data;
},

async getTrainingPlan(event: RequestEvent, id: number): Promise<TrainingPlan> {
    const response = await apiClient.getAxios().get<TrainingPlan>(`/api/training/plans/${id}`);
    return response.data;
},

async getTrainingSessions(event: RequestEvent, planId: number): Promise<TrainingSession[]> {
    const response = await apiClient.getAxios().get<TrainingSession[]>(`/api/training/plans/${planId}/sessions`);
    return response.data;
}
};

