import type { Cookies } from '@sveltejs/kit';
import type {
	Goal,
	Schedule,
	NutritionAdvice,
	TestScheduleResponse,
	SaveScheduleResponse,
	AddEntryResponse,
	ScheduledTrainingDetail,
	ExchangeCandidate,
	TrainingSurface,
	TrainingHeightDifference
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
		return fetchClient.put(
			`/api/entries/${entryId}/rpe`,
			{ rpe: feedback },
			{
				headers: bearerHeader(cookies),
				cookies
			}
		);
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
	},

	// ── Single training: read and mutate ───────────────────────────────
	//
	// Every call below returns the complete `ScheduledTrainingDetail`, so the
	// caller can replace its copy of the training outright instead of
	// refetching the whole week.

	/** Full detail for one scheduled training — more fields than the week response carries. */
	async getTraining(cookies: Cookies, trainingId: number): Promise<ScheduledTrainingDetail> {
		return fetchClient.get<ScheduledTrainingDetail>(`/api/schedule/trainings/${trainingId}`, {
			headers: bearerHeader(cookies),
			cookies
		});
	},

	/**
	 * Set the terrain the training will be run on.
	 *
	 * Unlike its siblings the response shape here is inferred rather than
	 * observed; it is assumed to match them.
	 */
	async setTrainingCondition(
		cookies: Cookies,
		trainingId: number,
		condition: {
			surface: TrainingSurface;
			heightDifference: TrainingHeightDifference;
			heightValue?: number;
			heightUnit?: string;
		}
	): Promise<ScheduledTrainingDetail> {
		return fetchClient.post<ScheduledTrainingDetail>(
			`/api/schedule/trainings/${trainingId}/training_condition`,
			{
				height_difference: condition.heightDifference,
				surface: condition.surface,
				height_value: condition.heightValue ?? 0,
				height_unit: condition.heightUnit ?? 'm'
			},
			{ headers: bearerHeader(cookies), cookies }
		);
	},

	/**
	 * Scale the training's pace.
	 *
	 * `intensityValue` is the `value` of a step from
	 * `change_intensity_package`, e.g. -2 for "A bit slower". It is a
	 * percentage delta, so the server stores `100 + intensityValue` as
	 * `training_condition.intensity` and rescales every block's pace and time.
	 * Only offer steps the server sent: the range is capped by the coach.
	 */
	async setIntensity(
		cookies: Cookies,
		trainingId: number,
		intensityValue: number
	): Promise<ScheduledTrainingDetail> {
		return fetchClient.put<ScheduledTrainingDetail>(
			`/api/schedule/trainings/${trainingId}/intensity`,
			{ intensity_value: intensityValue },
			{ headers: bearerHeader(cookies), cookies }
		);
	},

	/**
	 * Scale the training's volume.
	 *
	 * `distanceValue` is the `value` of a step from `change_distance_package`,
	 * e.g. -10 for "-10%". It is a **percentage delta, not a distance** — the
	 * field is named `distance_value` upstream, colliding with the actual
	 * distances on each block.
	 */
	async setDistance(
		cookies: Cookies,
		trainingId: number,
		distanceValue: number
	): Promise<ScheduledTrainingDetail> {
		return fetchClient.put<ScheduledTrainingDetail>(
			`/api/schedule/trainings/${trainingId}/distance`,
			{ distance_value: distanceValue },
			{ headers: bearerHeader(cookies), cookies }
		);
	},

	/** Assign one of the user's shoes (see `userApi.getShoes`) to this training. */
	async setSuggestedShoe(
		cookies: Cookies,
		trainingId: number,
		shoeId: number
	): Promise<ScheduledTrainingDetail> {
		return fetchClient.put<ScheduledTrainingDetail>(
			`/api/schedule/trainings/${trainingId}/suggested_shoe`,
			{ shoe_id: shoeId },
			{ headers: bearerHeader(cookies), cookies }
		);
	},

	/**
	 * Swap the session to another activity, e.g. `road_bike`.
	 *
	 * A cross-trained session has a duration but no distance or pace: its
	 * blocks come back with every measurement null, and `training_condition`
	 * and `suggested_shoe` are dropped. Exchanging the training reverts it.
	 *
	 * `crossType` is a plain string on purpose — `CROSS_TYPES` lists only the
	 * one value observed so far and is certainly incomplete.
	 */
	async crossTrain(
		cookies: Cookies,
		trainingId: number,
		crossType: string
	): Promise<ScheduledTrainingDetail> {
		return fetchClient.put<ScheduledTrainingDetail>(
			`/api/schedule/trainings/${trainingId}/cross_train`,
			{ cross_type: crossType },
			{ headers: bearerHeader(cookies), cookies }
		);
	},

	/** Alternative sessions that can replace this one. Gated by `can_be_exchanged`. */
	async getExchangeOptions(cookies: Cookies, trainingId: number): Promise<ExchangeCandidate[]> {
		return fetchClient.get<ExchangeCandidate[]>(`/api/schedule/trainings/${trainingId}/exchange`, {
			headers: bearerHeader(cookies),
			cookies
		});
	},

	/**
	 * Replace the training with one of the candidates from `getExchangeOptions`.
	 *
	 * The two ids come from different id spaces and are easy to mix up:
	 * `trainingId` is the scheduled training (a large id, goes in the path),
	 * `candidateId` is the `id` of an `ExchangeCandidate` (a small id, goes in
	 * the body as `training_id`).
	 */
	async exchangeTraining(
		cookies: Cookies,
		trainingId: number,
		candidateId: number
	): Promise<ScheduledTrainingDetail> {
		return fetchClient.put<ScheduledTrainingDetail>(
			`/api/schedule/trainings/${trainingId}/exchange`,
			{ training_id: candidateId },
			{ headers: bearerHeader(cookies), cookies }
		);
	}
};
