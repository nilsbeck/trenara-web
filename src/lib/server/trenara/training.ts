import type { Cookies } from '@sveltejs/kit';
import type {
	Goal,
	Schedule,
	NutritionAdvice,
	TestScheduleResponse,
	SaveScheduleResponse,
	AddEntryResponse
} from './types';
import { fetchClient } from './client';
import { TokenType } from '$lib/server/auth/types';

function bearerHeader(cookies: Cookies): Record<string, string> {
	return { Authorization: `Bearer ${cookies.get(TokenType.AccessToken)}` };
}

export const trainingApi = {
	async getGoal(cookies: Cookies): Promise<Goal> {
		return fetchClient.get<Goal>('/api/goal', {
			headers: bearerHeader(cookies),
			cookies
		});
	},

	async getSchedule(cookies: Cookies, timestamp: number): Promise<Schedule> {
		return fetchClient.get<Schedule>(`/api/schedule/week/?timestamp=${timestamp}`, {
			headers: bearerHeader(cookies),
			cookies
		});
	},

	async getNutrition(cookies: Cookies, timestamp: string): Promise<NutritionAdvice> {
		return fetchClient.get<NutritionAdvice>('/api/nutritional/advice', {
			headers: bearerHeader(cookies),
			cookies,
			params: { date: timestamp }
		});
	},

	async putFeedback(cookies: Cookies, entryId: number, feedback: number): Promise<unknown> {
		return fetchClient.put(`/api/entries/${entryId}/rpe`, { rpe: feedback }, {
			headers: bearerHeader(cookies),
			cookies
		});
	},

	async testChangeDate(
		cookies: Cookies,
		entryId: number,
		date: string,
		includeFuture: boolean
	): Promise<TestScheduleResponse> {
		return fetchClient.put<TestScheduleResponse>(
			`/api/schedule/trainings/${entryId}/change_test`,
			{ action: 'move', include_future: includeFuture, target_date: date },
			{ headers: bearerHeader(cookies), cookies }
		);
	},

	async saveChangeDate(
		cookies: Cookies,
		entryId: number,
		date: string,
		includeFuture: boolean
	): Promise<SaveScheduleResponse> {
		return fetchClient.put<SaveScheduleResponse>(
			`/api/schedule/trainings/${entryId}/change_save`,
			{ action: 'move', include_future: includeFuture, target_date: date },
			{ headers: bearerHeader(cookies), cookies }
		);
	},

	async addTraining(
		cookies: Cookies,
		name: string,
		timeInSeconds: number,
		date: string,
		distanceInKm: number
	): Promise<AddEntryResponse> {
		return fetchClient.post<AddEntryResponse>(
			'/api/entries',
			{
				name,
				time_in_sec: timeInSeconds,
				start_time: date,
				distance_value: distanceInKm,
				distance_unit: 'km'
			},
			{ headers: bearerHeader(cookies), cookies }
		);
	},

	async deleteTraining(cookies: Cookies, trainingId: number): Promise<unknown> {
		return fetchClient.delete(`/api/entries/${trainingId}`, {
			headers: bearerHeader(cookies),
			cookies
		});
	},

	async deleteScheduledTraining(cookies: Cookies, trainingId: number): Promise<unknown> {
		return fetchClient.delete(`/api/schedule/trainings/${trainingId}`, {
			headers: bearerHeader(cookies),
			cookies
		});
	}
};
