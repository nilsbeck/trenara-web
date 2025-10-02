/**
 * Training API module - now using fetch instead of axios
 * Maintains identical interface and behavior
 */

import { TokenType } from '../auth';
import { getSessionTokenCookie } from '../auth';
import { fetchClient } from './fetchClient';
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
    async getGoal(cookies: Cookies): Promise<Goal> {
        try {
            const response = await fetchClient.get<Goal>(`/api/goal`, {
                headers: {
                    Authorization: `Bearer ${getSessionTokenCookie(cookies, TokenType.AccessToken)}`
                },
                cookies
            });
            return response;
        } catch (error) {
            logError(error, 'getGoal');
            throw handleError(error);
        }
    },

    async getNutrition(cookies: Cookies, timestamp: string): Promise<NutritionAdvice> {
        try {
            const response = await fetchClient.get<NutritionAdvice>(
                `/api/nutritional/advice`, 
                {
                    headers: {
                        Authorization: `Bearer ${getSessionTokenCookie(cookies, TokenType.AccessToken)}`
                    },
                    cookies,
                    params: {
                        date: timestamp
                    }
                }
            );

            if (!response) {
                throw new ApiResponseError('No nutrition data found', 404);
            }

            return response;
        } catch (error) {
            logError(error, 'getNutrition');
            throw handleError(error);
        }
    },

    async getSchedule(cookies: Cookies, timestamp: number): Promise<Schedule> {
        try {
            const response = await fetchClient.get<Schedule>(
                `/api/schedule/week/?timestamp=${timestamp}`, 
                {
                    headers: {
                        Authorization: `Bearer ${getSessionTokenCookie(cookies, TokenType.AccessToken)}`
                    },
                    cookies
                }
            );

            if (!response) {
                throw new ApiResponseError('No schedule data found', 404);
            }

            return response;
        } catch (error) {
            logError(error, 'getSchedule');
            throw handleError(error);
        }
    },

    async putFeedback(cookies: Cookies, entryId: number, feedback: number) {
        try {
            const response = await fetchClient.put(
                `/api/entries/${entryId}/rpe`,
                { rpe: feedback },
                {
                    headers: {
                        Authorization: `Bearer ${getSessionTokenCookie(cookies, TokenType.AccessToken)}`
                    },
                    cookies
                }
            );

            return response;
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
            const response = await fetchClient.put<TestScheduleResponse>(
                `/api/schedule/trainings/${entryId}/change_test`,
                {
                    action: 'move',
                    include_future: includeFuture,
                    target_date: date
                },
                {
                    headers: {
                        Authorization: `Bearer ${getSessionTokenCookie(cookies, TokenType.AccessToken)}`
                    },
                    cookies
                }
            );

            if (!response) {
                throw new ApiResponseError('Failed to test date change', 400);
            }

            return response;
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
            const response = await fetchClient.put<SaveScheduleResponse>(
                `/api/schedule/trainings/${entryId}/change_save`,
                {
                    action: 'move',
                    include_future: includeFuture,
                    target_date: date
                },
                {
                    headers: {
                        Authorization: `Bearer ${getSessionTokenCookie(cookies, TokenType.AccessToken)}`
                    },
                    cookies
                }
            );

            if (!response) {
                throw new ApiResponseError('Failed to save date change', 400);
            }

            return response;
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
            const response = await fetchClient.post<AddEntryResponse>(
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
                    },
                    cookies
                }
            );

            if (!response) {
                throw new ApiResponseError('Failed to add training', 400);
            }

            return response;
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
            const response = await fetchClient.delete<AddEntryResponse>(
                `/api/entries/${trainingId}`,
                {
                    headers: {
                        Authorization: `Bearer ${getSessionTokenCookie(cookies, TokenType.AccessToken)}`
                    },
                    cookies
                }
            );

            if (!response) {
                throw new ApiResponseError('Failed to delete training', 400);
            }

            return response;
        } catch (error) {
            logError(error, 'deleteTraining');
            throw handleError(error);
        }
    }
};
