import type { Cookies } from '@sveltejs/kit';
import type {
	Entry,
	Goal,
	Schedule,
	NutritionAdvice,
	TestScheduleResponse,
	SaveScheduleResponse,
	AddEntryResponse,
	ScheduledTrainingDetail,
	ExchangeCandidate,
	NewTrainingCandidate,
	AddNewTrainingRequest,
	ScheduleChangeRequest,
	TrainingSurface,
	TrainingHeightDifference,
	PacingPlan,
	SetTrainingConditionRequest,
	SetIntensityRequest,
	SetDistanceRequest,
	ToggleCooldownRequest,
	SetSuggestedShoeRequest,
	CrossTrainRequest,
	SetPacingPlanRequest,
	ExchangeTrainingRequest
} from './types';
import { fetchClient } from './client';
import { TokenType } from '$lib/server/auth/types';
import { cachedRead, CacheKey, invalidate } from './read-cache';
import { expectArray, expectCollections, expectObject } from './shape';

function bearerHeader(cookies: Cookies): Record<string, string> {
	return { Authorization: `Bearer ${cookies.get(TokenType.AccessToken)}` };
}

/**
 * Run a write, then drop everything cached for that runner.
 *
 * Wrapped rather than remembered at each call site: a mutation that forgets it
 * leaves the plan on screen quietly disagreeing with what the runner just did,
 * and that is a bad thing to leave to memory.
 *
 * All of it, rather than the weeks alone. Changing a session's intensity moves
 * the week it is in *and* the predictions in `/api/me/stats`, and working out
 * which reads a given write can reach is exactly the reasoning that gets
 * quietly wrong later. The cost of being crude is one extra request for a
 * profile nobody edited; the cost of being clever and wrong is a stale plan.
 *
 * Only on success — a refused write changed nothing, so there is nothing to
 * forget.
 */
async function mutating<T>(cookies: Cookies, run: () => Promise<T>): Promise<T> {
	const result = await run();
	invalidate(cookies);
	return result;
}

/**
 * The dry run of a schedule change: what it would do to the goal, changing
 * nothing. Deliberately not `mutating` — dropping the cache for a question
 * would cost a month of weeks for no change upstream.
 */
async function testScheduleChange(
	cookies: Cookies,
	trainingId: number,
	body: ScheduleChangeRequest
): Promise<TestScheduleResponse> {
	return expectObject<TestScheduleResponse>(
		await fetchClient.put<unknown>(`/api/schedule/trainings/${trainingId}/change_test`, body, {
			headers: bearerHeader(cookies),
			cookies
		}),
		'/api/schedule/trainings/{id}/change_test'
	);
}

/** The same body as {@link testScheduleChange}, applied. Answers with the week it landed in. */
async function saveScheduleChange(
	cookies: Cookies,
	trainingId: number,
	body: ScheduleChangeRequest
): Promise<SaveScheduleResponse> {
	return mutating(cookies, async () =>
		expectCollections<SaveScheduleResponse>(
			await fetchClient.put<unknown>(`/api/schedule/trainings/${trainingId}/change_save`, body, {
				headers: bearerHeader(cookies),
				cookies
			}),
			'/api/schedule/trainings/{id}/change_save',
			['trainings']
		)
	);
}

export const trainingApi = {
	/**
	 * The goal being trained for.
	 *
	 * Read by the dashboard and again by the goal page, so it arrived four
	 * times in the minute that tripped the rate limit. Nothing in this app sets
	 * a goal, so it only changes when the runner changes it in Trenara itself.
	 */
	async getGoal(cookies: Cookies): Promise<Goal> {
		return cachedRead(cookies, CacheKey.goal, () =>
			fetchClient.get<Goal>('/api/goal', {
				headers: bearerHeader(cookies),
				cookies
			})
		);
	},

	/**
	 * One week of the plan.
	 *
	 * Served from {@link cachedRead} unless `fresh` is asked for. There is no
	 * month endpoint, so a month costs five or six of these — by a distance the
	 * most requested thing in the app, and half of everything it sends.
	 */
	async getSchedule(
		cookies: Cookies,
		timestamp: number,
		{ fresh = false }: { fresh?: boolean } = {}
	): Promise<Schedule> {
		return cachedRead(
			cookies,
			CacheKey.week(timestamp),
			async () =>
				expectCollections<Schedule>(
					await fetchClient.get<unknown>(`/api/schedule/week/?timestamp=${timestamp}`, {
						headers: bearerHeader(cookies),
						cookies
					}),
					'/api/schedule/week/',
					['trainings', 'strength_trainings', 'entries']
				),
			{ fresh }
		);
	},

	async getNutrition(cookies: Cookies, timestamp: string): Promise<NutritionAdvice> {
		return fetchClient.get<NutritionAdvice>('/api/nutritional/advice', {
			headers: bearerHeader(cookies),
			cookies,
			params: { date: timestamp }
		});
	},

	/**
	 * Record how hard a completed session felt, on the 1–10 RPE scale.
	 *
	 * Answers with the whole updated `Entry` rather than an acknowledgement —
	 * `rpe` set to what was sent and `ask_feedback` already `false` — so a
	 * caller can replace its copy from the response instead of guessing at the
	 * new state or refetching the week. Same convention as the training
	 * mutations above; see `docs/backend-api.md`.
	 */
	async putFeedback(cookies: Cookies, entryId: number, feedback: number): Promise<Entry> {
		return mutating(cookies, async () =>
			expectObject<Entry>(
				await fetchClient.put<unknown>(
					`/api/entries/${entryId}/rpe`,
					{ rpe: feedback },
					{
						headers: bearerHeader(cookies),
						cookies
					}
				),
				'/api/entries/{id}/rpe'
			)
		);
	},

	async testChangeDate(
		cookies: Cookies,
		entryId: number,
		date: string,
		includeFuture: boolean
	): Promise<TestScheduleResponse> {
		return testScheduleChange(cookies, entryId, {
			action: 'move',
			include_future: includeFuture,
			target_date: date
		});
	},

	async saveChangeDate(
		cookies: Cookies,
		entryId: number,
		date: string,
		includeFuture: boolean
	): Promise<SaveScheduleResponse> {
		return saveScheduleChange(cookies, entryId, {
			action: 'move',
			include_future: includeFuture,
			target_date: date
		});
	},

	/**
	 * Ask what removing a scheduled session would do to the goal, without
	 * removing it. The same `change_test` the move flow uses, with
	 * `action: 'destroy'` and no date.
	 *
	 * This is how the app removes a training added through
	 * {@link trainingApi.addNewTraining} — captured 2026-10-07. Whether it is
	 * also how a planned session is removed, in place of
	 * `deleteScheduledTraining`'s `DELETE`, has not been captured.
	 */
	async testRemoveTraining(
		cookies: Cookies,
		trainingId: number,
		includeFuture: boolean
	): Promise<TestScheduleResponse> {
		return testScheduleChange(cookies, trainingId, {
			action: 'destroy',
			include_future: includeFuture
		});
	},

	/**
	 * Remove a scheduled session. Answers with its week, without the session
	 * and with `can_receive_new_trainings` re-opened when the week had been
	 * full — but without `strength_trainings` or `entries`; see
	 * {@link SaveScheduleResponse}.
	 */
	async saveRemoveTraining(
		cookies: Cookies,
		trainingId: number,
		includeFuture: boolean
	): Promise<SaveScheduleResponse> {
		return saveScheduleChange(cookies, trainingId, {
			action: 'destroy',
			include_future: includeFuture
		});
	},

	// ── Adding a session to a week ──────────────────────────────────────
	//
	// Gated by the week's `can_receive_new_trainings`. Two steps, like an
	// exchange: list what could go on a day, then add one of them. The path
	// takes the week's id (`Schedule.id`), not a training's.

	/**
	 * The sessions that could be added on `date` (`YYYY-MM-DD`, the runner's
	 * local day) in the week `scheduleId`.
	 *
	 * Not cached, like the exchange list: it is asked for when a picker opens,
	 * and the answer depends on what the week already holds.
	 */
	async getNewTrainings(
		cookies: Cookies,
		scheduleId: number,
		date: string
	): Promise<NewTrainingCandidate[]> {
		return expectArray<NewTrainingCandidate>(
			await fetchClient.get<unknown>(`/api/schedule/${scheduleId}/new_trainings`, {
				headers: bearerHeader(cookies),
				cookies,
				params: { date }
			}),
			'/api/schedule/{id}/new_trainings'
		);
	},

	/**
	 * Add one of `getNewTrainings`'s candidates to the week.
	 *
	 * `candidateId` is the candidate's template id and goes in the body as
	 * `training_id`; the answer is the complete new scheduled training, with a
	 * scheduled id of its own, like every other training mutation. Its
	 * `day_long` is a UTC instant rather than a date — see
	 * {@link ScheduledTraining} — so date it from `day`.
	 */
	async addNewTraining(
		cookies: Cookies,
		scheduleId: number,
		date: string,
		candidateId: number
	): Promise<ScheduledTrainingDetail> {
		return mutating(cookies, async () =>
			expectObject<ScheduledTrainingDetail>(
				await fetchClient.post<unknown>(
					`/api/schedule/${scheduleId}/new_trainings`,
					{ date, training_id: candidateId } satisfies AddNewTrainingRequest,
					{ headers: bearerHeader(cookies), cookies }
				),
				'/api/schedule/{id}/new_trainings'
			)
		);
	},

	async addTraining(
		cookies: Cookies,
		name: string,
		timeInSeconds: number,
		date: string,
		distanceInKm: number
	): Promise<AddEntryResponse> {
		return mutating(cookies, () =>
			fetchClient.post<AddEntryResponse>(
				'/api/entries',
				{
					name,
					time_in_sec: timeInSeconds,
					start_time: date,
					distance_value: distanceInKm,
					distance_unit: 'km'
				},
				{ headers: bearerHeader(cookies), cookies }
			)
		);
	},

	async deleteTraining(cookies: Cookies, trainingId: number): Promise<unknown> {
		return mutating(cookies, () =>
			fetchClient.delete(`/api/entries/${trainingId}`, {
				headers: bearerHeader(cookies),
				cookies
			})
		);
	},

	async deleteScheduledTraining(cookies: Cookies, trainingId: number): Promise<unknown> {
		return mutating(cookies, () =>
			fetchClient.delete(`/api/schedule/trainings/${trainingId}`, {
				headers: bearerHeader(cookies),
				cookies
			})
		);
	},

	// ── Single training: read and mutate ───────────────────────────────
	//
	// Every call below returns the complete `ScheduledTrainingDetail`, so the
	// caller can replace its copy of the training outright instead of
	// refetching the whole week.

	/** Full detail for one scheduled training — more fields than the week response carries. */
	async getTraining(cookies: Cookies, trainingId: number): Promise<ScheduledTrainingDetail> {
		return expectObject<ScheduledTrainingDetail>(
			await fetchClient.get<unknown>(`/api/schedule/trainings/${trainingId}`, {
				headers: bearerHeader(cookies),
				cookies
			}),
			'/api/schedule/trainings/{id}'
		);
	},

	/**
	 * Set the terrain the training will be run on.
	 *
	 * Every field goes up on every call. Unlike its siblings this endpoint does
	 * not merge a partial body: leaving one out is answered "The … field is
	 * required" rather than keeping the stored value, so the two the caller
	 * rarely cares about fall back to the defaults the app itself sends.
	 *
	 * The response is the complete new training, matching its siblings — since
	 * a 2026-08-27 capture, observed rather than assumed. Note that a
	 * `height_value` of 0 comes back as `training_condition.height_value: null`,
	 * so the response is not a faithful echo of the request.
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
		return mutating(cookies, () =>
			fetchClient.post<ScheduledTrainingDetail>(
				`/api/schedule/trainings/${trainingId}/training_condition`,
				{
					height_difference: condition.heightDifference,
					surface: condition.surface,
					height_value: condition.heightValue ?? 0,
					height_unit: condition.heightUnit ?? 'm'
				} satisfies SetTrainingConditionRequest,
				{ headers: bearerHeader(cookies), cookies }
			)
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
		return mutating(cookies, () =>
			fetchClient.put<ScheduledTrainingDetail>(
				`/api/schedule/trainings/${trainingId}/intensity`,
				{ intensity_value: intensityValue } satisfies SetIntensityRequest,
				{ headers: bearerHeader(cookies), cookies }
			)
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
		return mutating(cookies, () =>
			fetchClient.put<ScheduledTrainingDetail>(
				`/api/schedule/trainings/${trainingId}/distance`,
				{ distance_value: distanceValue } satisfies SetDistanceRequest,
				{ headers: bearerHeader(cookies), cookies }
			)
		);
	},

	/**
	 * Add or remove the training's cool-down.
	 *
	 * Gated by `can_toggle_cooldown`, which is only true on sessions that have a
	 * cool-down to drop — plenty of runs have none, and those cannot gain one.
	 * The response carries the rebuilt training: dropping the cool-down removes
	 * its block and subtracts its distance and time from the totals.
	 *
	 * The body key is `cooldown_toggle`, not `has_cooldown` — the only mutation
	 * whose request field is named differently from the field it sets, and
	 * sending the wrong one is answered 200 and ignored. See
	 * {@link ToggleCooldownRequest}.
	 */
	async setCooldown(
		cookies: Cookies,
		trainingId: number,
		hasCooldown: boolean
	): Promise<ScheduledTrainingDetail> {
		return mutating(cookies, () =>
			fetchClient.put<ScheduledTrainingDetail>(
				`/api/schedule/trainings/${trainingId}/cooldown`,
				{ cooldown_toggle: hasCooldown } satisfies ToggleCooldownRequest,
				{ headers: bearerHeader(cookies), cookies }
			)
		);
	},

	/** Assign one of the user's shoes (see `userApi.getShoes`) to this training. */
	async setSuggestedShoe(
		cookies: Cookies,
		trainingId: number,
		shoeId: number
	): Promise<ScheduledTrainingDetail> {
		return mutating(cookies, () =>
			fetchClient.put<ScheduledTrainingDetail>(
				`/api/schedule/trainings/${trainingId}/suggested_shoe`,
				{ shoe_id: shoeId } satisfies SetSuggestedShoeRequest,
				{ headers: bearerHeader(cookies), cookies }
			)
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
	 * one value observed so far and is certainly incomplete. `null` reverts the
	 * session to a run, which the app offers from this same picker.
	 */
	async crossTrain(
		cookies: Cookies,
		trainingId: number,
		crossType: string | null
	): Promise<ScheduledTrainingDetail> {
		return mutating(cookies, () =>
			fetchClient.put<ScheduledTrainingDetail>(
				`/api/schedule/trainings/${trainingId}/cross_train`,
				{ cross_type: crossType } satisfies CrossTrainRequest,
				{ headers: bearerHeader(cookies), cookies }
			)
		);
	},

	/**
	 * Choose a pacing strategy for the goal race.
	 *
	 * Gated by `can_change_pacing_plan`, true only on that one session. Unlike
	 * `setIntensity`/`setDistance`, `pacingPlan` is not a percentage delta — it
	 * is a `change_pacing_plan_package` option's `value`, an identifier
	 * (`'trenara'`, `'alternative'`) or `null` for no pacing plan at all.
	 */
	async setPacingPlan(
		cookies: Cookies,
		trainingId: number,
		pacingPlan: PacingPlan | null
	): Promise<ScheduledTrainingDetail> {
		return mutating(cookies, () =>
			fetchClient.put<ScheduledTrainingDetail>(
				`/api/schedule/trainings/${trainingId}/pacing_plan`,
				{ pacing_plan: pacingPlan } satisfies SetPacingPlanRequest,
				{ headers: bearerHeader(cookies), cookies }
			)
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
		return mutating(cookies, () =>
			fetchClient.put<ScheduledTrainingDetail>(
				`/api/schedule/trainings/${trainingId}/exchange`,
				{ training_id: candidateId } satisfies ExchangeTrainingRequest,
				{ headers: bearerHeader(cookies), cookies }
			)
		);
	}
};
