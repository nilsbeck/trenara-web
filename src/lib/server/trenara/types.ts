export interface User {
	id: number;
	account_created_at: number;
	active_measurement_system: string;
	can_create_team: boolean;
	can_join_team: boolean;
	can_set_goal: boolean;
	country: string | null;
	date_of_birth: string;
	email: string;
	first_name: string;
	gender: string;
	has_garmin_export: boolean;
	has_garmin_import: boolean;
	has_nutritional_coach: boolean;
	has_polar: boolean;
	has_premium: boolean;
	has_right_on_free_trial: boolean;
	has_strava: boolean;
	height: number;
	height_unit: string;
	is_ultimate: boolean;
	is_starter: boolean;
	is_trainee: boolean;
	is_trainer: boolean;
	last_name: string;
	location: string | null;
	nationality: {
		id: number;
		name: string;
		flag: string;
		region: string;
		subregion: string;
		demonym: string;
		start_of_week: string;
	};
	nationality_id: number;
	pause_cause: string | null;
	paused_since: number | null;
	preferred_distance_unit_large: string;
	preferred_distance_unit_large_text: string;
	preferred_distance_unit_small: string;
	preferred_distance_unit_small_text: string;
	premium_auto_renew: boolean;
	premium_platform: string;
	premium_total_time: string;
	premium_type: string;
	premium_until: number;
	profile_picture: {
		id: number;
		path: string;
		original_path: string;
		size_in_kb: number;
		created_at: number;
	};
	qr_code_url: string | null;
	strength_calibration_notification_at: number | null;
	strength_calibrated: boolean;
	turnaround_heartbeat: number | null;
	uses_imperial: boolean;
	weight: number;
	weight_unit: string;
	weekly_trainings: number;
	heartbeat_prior: boolean;
	is_paused: boolean;
	trainer_picture_url: string;
}

export interface AuthResponse {
	access_token: string;
	refresh_token: string;
	token_type: string;
	expires_in: number;
}

export interface LoginRequest {
	username: string;
	password: string;
}

export interface RefreshTokenRequest {
	refresh_token: string;
}

export interface Entry {
	id: number;
	name: string;
	start_time: string;
	type: string;
	icon: string;
	total_altitude: number | null;
	avg_heartbeat: number | null;
	rpe: number | null;
	comment: string | null;
	strava: boolean;
	strava_url: string | null;
	garmin: boolean;
	polar: boolean;
	trenara: boolean;
	distance: string;
	distance_value: number;
	distance_unit: string;
	distance_unit_text: string;
	time: string;
	time_in_sec: number;
	time_value: number;
	time_unit: string;
	pace: string;
	pace_value: number;
	pace_unit: string;
	gps_media: object[];
	notification: {
		id: number;
		title: string;
		content: string;
		notification_type: string;
		metadata: {
			name: string;
			goal: string;
			goal_daily_tss: number;
			goal_pvt_tss: number;
			done_tss: number;
			type: string;
		};
		training_id: number | null;
		entry_id: number;
		medal_id: number | null;
		created_at: string;
		actions: string[];
	} | null;
	laps: Array<{
		id: number;
		order: number;
		pace_percentage: number;
		heartbeat: number;
		altitude: number;
		type: string;
		time: string;
		time_in_sec: number;
		time_value: number;
		time_unit: string;
		pace: string;
		pace_value: number;
		pace_unit: string;
		distance: string;
		distance_value: number;
		distance_unit: string;
		distance_unit_text: string;
		sum_distance: string;
		sum_distance_value: number;
		sum_distance_unit: string;
		sum_distance_unit_text: string;
	}>;
	splits: object[];
}

export interface Exercise {
	id: number;
	type: string;
	name: string;
	howto: string;
	tips: string;
	sort: number;
	icon_image: {
		id: number;
		path: string;
		original_path: string;
		size_in_kb: number;
		created_at: number;
	};
	thumbnail: {
		id: number;
		path: string;
		original_path: string;
		size_in_kb: number;
		created_at: number;
	};
}

/**
 * Known `surface` values for a training condition.
 *
 * Read models keep `surface` as a plain `string`. This is a reverse-engineered
 * API and Trenara can add a value at any time, so narrowing what we *read*
 * would turn a new surface into a type that lies. Only request payloads, where
 * we choose the value, use `TrainingSurface`.
 */
export const TRAINING_SURFACES = ['road', 'treadmill', 'single_track', 'athletics_track'] as const;
export type TrainingSurface = (typeof TRAINING_SURFACES)[number];

/**
 * Known `height_difference` values for a training condition.
 *
 * `lights` is spelled the way the API spells it. It reads like an upstream typo
 * for "light", but "light" is not a value we have seen accepted.
 */
export const TRAINING_HEIGHT_DIFFERENCES = ['flat', 'lights', 'strong', 'mountain'] as const;
export type TrainingHeightDifference = (typeof TRAINING_HEIGHT_DIFFERENCES)[number];

/**
 * Known `cross_type` values.
 *
 * Only `road_bike` has been observed, so this list is certainly incomplete.
 * That is why `crossTrain()` takes a plain `string`: refusing a value we simply
 * have not seen yet would be worse than passing it through.
 */
export const CROSS_TYPES = ['road_bike'] as const;
export type CrossType = (typeof CROSS_TYPES)[number];

/**
 * One step of a training.
 *
 * Blocks come in two flavours and this one interface covers both:
 *
 * - **Group blocks** (`type: 'core'`) carry `repeat` and `blocks`, and omit
 *   every measurement field. Check `blocks` before reading anything else.
 * - **Leaf blocks** (`run`, `warmup`, `rest`, ...) carry the measurements.
 *
 * On a cross-trained session (see `ScheduledTraining.cross_type`) the leaf
 * measurements are present but `null`: a bike ride has a duration and no
 * distance or pace. So most fields here are both optional (absent on group
 * blocks) and nullable (null on cross-trains).
 */
export interface TrainingBlock {
	order: number;
	/**
	 * Structural role — `warmup`, `core`, `run`, `rest`.
	 *
	 * This is NOT the activity: a cycling session's block is still typed `run`
	 * while its `text` reads "Ride 01:43:43". Only the parent's `cross_type`
	 * says what is actually being done.
	 */
	type: string;
	/** Whether the block is defined primarily by `distance` or by `time`. */
	prior?: string;
	/**
	 * Graph colour. Derived from the pace zone, so it shifts when intensity
	 * changes — re-read it from each response rather than caching it.
	 */
	hex_graph?: string;
	hex_text?: string;
	calc_distance_in_km?: number | null;
	calc_time_in_sec?: number | null;
	time?: string | null;
	time_in_sec?: number | null;
	time_value?: number | null;
	time_unit?: string | null;
	distance?: string | null;
	/** Distance expressed in `distance_unit`, which is `m` as often as `km`. */
	distance_value?: number | null;
	distance_unit?: string | null;
	distance_unit_text?: string | null;
	pace?: string | null;
	/** Pace in seconds per `distance_unit`. */
	pace_value?: number | null;
	pace_unit?: string | null;
	/** Speed as a display string, e.g. "9.38 km/h". */
	pace_per_hour?: string | null;
	/**
	 * NOT a km/h number despite the name — it repeats `pace_value`, i.e. seconds
	 * per unit. Only the `pace_per_hour` string is actually in km/h.
	 */
	pace_per_hour_value?: number | null;
	pace_per_hour_unit?: string | null;
	/** Whether to prefer the km/h strings over min/km. Varies per training. */
	prefer_pph?: boolean;
	pace_range?: string | null;
	/**
	 * Slow end of the range. Pace is seconds per unit, so `_min` holds the
	 * LARGER number — do not `Math.min` this pair.
	 */
	pace_range_value_min?: number | null;
	/** Fast end of the range, i.e. the smaller number. */
	pace_range_value_max?: number | null;
	pace_per_hour_range?: string | null;
	pace_per_hour_range_value_min?: number | null;
	pace_per_hour_range_value_max?: number | null;
	text?: string;
	/** `text` with speeds rendered in km/h instead of min/km. */
	text_pph?: string;
	/** How many times the group repeats. Group blocks only. */
	repeat?: number;
	/** Child blocks. Present only on group blocks. */
	blocks?: TrainingBlock[];
}

/**
 * The workout itself: its blocks plus the aggregates the server precomputes.
 *
 * The distance aggregates are all nullable because a cross-trained session has
 * no distance at all. Note the time aggregates can be off by a second against
 * the sum of the blocks (server-side rounding), so do not derive one from the
 * other.
 */
export interface Training {
	blocks: TrainingBlock[];
	total_time_in_sec: number;
	core_time_in_sec: number;
	/**
	 * Total distance in km at full precision — `12.0934` where
	 * `total_distance_value` rounds to `12.09`. `0` on cross-trained sessions,
	 * where the `total_distance_*` fields are `null` instead.
	 */
	total_distance_in_km?: number;
	/** Present-and-null on runs, absent entirely on cross-trained sessions. */
	pre_advice?: string | null;
	post_advice?: string | null;
	/**
	 * Core aggregates count the repeated work only: on a strides session
	 * `core_time_in_sec` covers the strides and excludes the rests, while
	 * `total_time_in_sec` includes them.
	 */
	core_distance?: string | null;
	core_distance_value?: number | null;
	core_distance_unit?: string | null;
	core_distance_unit_text?: string | null;
	core_time: string;
	core_time_value: number;
	core_time_unit: string;
	total_distance?: string | null;
	/** Rounded; `total_distance_in_km` carries full precision and the two can disagree. */
	total_distance_value?: number | null;
	total_distance_unit?: string | null;
	total_distance_unit_text?: string | null;
	total_time: string;
	total_time_value: number;
	total_time_unit: string;
}

/**
 * Terrain settings attached to a **goal** (and to its intermediate goals).
 *
 * Deliberately kept separate from `ScheduledTrainingCondition`: the two shapes
 * overlap but are not the same, and the goal payload has never been seen to
 * carry `intensity`, `updated_at` or `height_value`.
 */
export interface TrainingCondition {
	id: number;
	height_difference: string | null;
	surface: string;
	height: number | null;
	height_unit: string | null;
}

/**
 * Terrain and intensity settings attached to one **scheduled training**.
 *
 * `null` on a training whose conditions have never been set, which is the
 * default state rather than an edge case — both a plain run and a cross-trained
 * session come back with `training_condition: null` until something sets it.
 */
export interface ScheduledTrainingCondition {
	id: number;
	/** e.g. "SchedulePivot". */
	type?: string;
	/** One of `TRAINING_HEIGHT_DIFFERENCES`; typed loosely, see that constant. */
	height_difference: string | null;
	/** One of `TRAINING_SURFACES`; typed loosely, see that constant. */
	surface: string;
	/**
	 * Percentage of the planned speed, i.e. `100 + intensityStep.value`.
	 * At 98 every pace is scaled by `100 / 98`, about 2% slower.
	 *
	 * Do not read the applied intensity from here. The whole
	 * `training_condition` is null on a training whose terrain has never been
	 * set, even when an intensity step *is* applied — the step's `selected` flag
	 * in `change_intensity_package` is the only reliable source.
	 */
	intensity?: number;
	updated_at: number;
	height: number | null;
	height_value?: number | null;
	height_unit: string | null;
	height_unit_text?: string | null;
}

/** One selectable adjustment inside a {@link ChangePackage}. */
export interface ChangeStep {
	/** 1-based position in `steps`. Not what you send — send `value`. */
	step: number;
	/**
	 * The number the corresponding PUT expects. What it *means* varies by
	 * package and by session: a percentage delta on a distance package for a
	 * steady run (`-30` for "-30%"), but a repetition count on the same package
	 * for an interval session (`2` for "2x"). Never do arithmetic on it — pass
	 * it back and render `text`.
	 */
	value: number;
	/** Render as-is: "-30%", "2x", "A bit slower". */
	text: string;
	selected: boolean;
}

/**
 * A server-authoritative set of adjustments (distance, intensity, pacing plan).
 *
 * Step count and values differ per training and are capped by the coach, so
 * never generate the range client-side. Find the current setting via
 * `selected`, not by index: packages have been seen with four steps and five.
 */
export interface ChangePackage {
	title: string;
	text: string;
	steps: ChangeStep[];
}

/** The team a training is shared with. */
export interface TeamData {
	team_id: number;
	name: string;
	picture: string | null;
	nr_same_day_participants: number;
	nr_other_day_participants: number;
	matches_captain_day: boolean;
	captain_pace: boolean;
	can_toggle_pace: boolean;
	can_show_participant_overview: boolean;
}

/** Known shoe `type` values. Typed loosely on read, see `TRAINING_SURFACES` for why. */
export const SHOE_TYPES = ['supertrainer', 'supershoe', 'long_run', 'trail'] as const;
export type ShoeType = (typeof SHOE_TYPES)[number];

/** A shoe in the user's locker, and the shape embedded as `suggested_shoe`. */
export interface Shoe {
	id: number;
	/** "Other" is a sentinel — the real make is then in `name`. */
	brand: string;
	name: string;
	/** One of `SHOE_TYPES`; typed loosely, see that constant. */
	type: string;
	preferred: boolean;
	/** `YYYY-MM-DD`, unlike the ISO timestamps below. */
	buy_date: string;
	/**
	 * `distance_done_value / expected_lifetime_distance_value * 100`, derived
	 * server-side and delivered with float noise (`30.260000000000005`).
	 * Round before display.
	 */
	lifetime_percentage: number;
	/** ISO-8601 with offset — unlike the unix seconds used everywhere else in this API. */
	created_at: string;
	updated_at: string;
	retired_at: string | null;
	expected_lifetime_distance: string;
	expected_lifetime_distance_value: number;
	expected_lifetime_distance_unit: string;
	expected_lifetime_distance_unit_text: string;
	distance_done: string;
	distance_done_value: number;
	distance_done_unit: string;
	distance_done_unit_text: string;
	avg_pace: string;
	/** Seconds per `avg_pace_unit`. */
	avg_pace_value: number;
	avg_pace_unit: string;
	picture: string | null;
}

export interface StrengthTraining {
	id: number;
	strength_id: number | null;
	type_id: number;
	title: string;
	training_type: string;
	description: string;
	icon_url: string;
	day: string;
	time: string;
	rest_between_sets: number;
	rest_between_exercises: number;
	exercises: Exercise[];
	accessories: { id: number; name: string }[];
}

/**
 * A training on the schedule.
 *
 * One shape serves both `/api/schedule/week/` and the richer
 * `/api/schedule/trainings/{id}`. Everything only the detail endpoint has been
 * seen to return is optional here, so a week payload still satisfies the type.
 * See {@link ScheduledTrainingDetail}.
 */
export interface ScheduledTraining {
	id: number;
	day: number;
	day_long: string;
	title: string;
	description: string;
	show_description_from: number;
	/** Week response only — the detail endpoint omits it. */
	nutritional_advice?: string;
	type: string;
	icon_url: string;
	hex_training: string;
	hex_completed: string | null;
	training: Training;
	last_garmin_sync: string | null;
	can_be_edited: boolean;
	/** `null` until conditions are set on this training — the usual state. */
	training_condition?: ScheduledTrainingCondition | null;

	// ── Fields observed only on the detail endpoint and the mutations ──
	can_cross_train?: boolean;
	/** Set once the session is swapped to another activity. See `CROSS_TYPES`. */
	cross_type?: string | null;
	can_toggle_cooldown?: boolean;
	has_cooldown?: boolean;
	can_change_distance?: boolean;
	/** Populated only while `can_change_distance` is true. */
	change_distance_package?: ChangePackage | null;
	can_change_intensity?: boolean;
	change_intensity_package?: ChangePackage | null;
	can_change_pacing_plan?: boolean;
	change_pacing_plan_package?: ChangePackage | null;
	can_be_exchanged?: boolean;
	team_data?: TeamData | null;
	/** `null` when no shoe is assigned — the usual state. */
	suggested_shoe?: Shoe | null;
}

/**
 * What the training detail endpoint returns — and what every training mutation
 * returns too. All seven of `GET /schedule/trainings/{id}`, `PUT .../distance`,
 * `PUT .../intensity`, `PUT .../suggested_shoe`, `PUT .../cross_train`,
 * `PUT .../exchange` and `POST .../training_condition` hand back the complete
 * new state, so callers patch their store in place rather than refetch a week.
 */
export type ScheduledTrainingDetail = ScheduledTraining;

/**
 * An alternative session offered by `GET /schedule/trainings/{id}/exchange`.
 *
 * Its `id` belongs to a different id space than the scheduled training id in
 * the URL: pass it back as `training_id` in the body, never as the path id.
 * A candidate is not scheduled yet, so it carries no conditions, team or shoe.
 */
export type ExchangeCandidate = Omit<
	ScheduledTraining,
	'training_condition' | 'team_data' | 'suggested_shoe'
>;

/**
 * Body of `POST /schedule/trainings/{id}/training_condition`.
 *
 * All four fields go up on every call, including the two the caller usually
 * has no opinion about. This is the one write here that does not accept a
 * partial body: omitting a field is answered "The height difference field is
 * required" rather than left at its current value, so the request carries the
 * whole condition and `height_value` falls back to its default of 0.
 *
 * Both enums travel as the labels the read side returns — `"flat"`,
 * `"treadmill"`. An unrecognised one is refused with "The selected height
 * difference is invalid", so the terrain editor stages a known label rather
 * than passing an unfamiliar one through.
 */
export interface SetTrainingConditionRequest {
	height_difference: TrainingHeightDifference;
	surface: TrainingSurface;
	/** Metres of climb. 0 is the default, and what the app sends unless asked otherwise. */
	height_value: number;
	height_unit: string;
}

/** Body of `PUT /schedule/trainings/{id}/intensity`. */
export interface SetIntensityRequest {
	/** A `change_intensity_package` step's `value` — a percentage delta. */
	intensity_value: number;
}

/** Body of `PUT /schedule/trainings/{id}/distance`. */
export interface SetDistanceRequest {
	/**
	 * A `change_distance_package` step's `value`, whatever that package means by
	 * it — a percentage delta on a steady run (`-10` for "10% shorter"), a
	 * repetition count on an interval session (`2` for "2x", where the package
	 * calls itself "Fine-tune intervals").
	 *
	 * Either way it is NOT a distance, despite sharing a name with
	 * `TrainingBlock.distance_value`. Send a step's `value` verbatim.
	 */
	distance_value: number;
}

/** Body of `PUT /schedule/trainings/{id}/suggested_shoe`. */
export interface SetSuggestedShoeRequest {
	shoe_id: number;
}

/** Body of `PUT /schedule/trainings/{id}/exchange`. */
export interface ExchangeTrainingRequest {
	/** A candidate id from `GET .../exchange`, not the scheduled training id. */
	training_id: number;
}

/**
 * Body of `PUT /schedule/trainings/{id}/cooldown`.
 *
 * The key is `cooldown_toggle`, not `has_cooldown` — this is the only mutation
 * whose request field is named differently from the field it sets. Sending
 * `has_cooldown` is accepted with a 200 and silently ignored, which is worse
 * than a rejection: the response comes back with the cool-down untouched.
 */
export interface ToggleCooldownRequest {
	/** The state the cool-down should end in, despite reading like a verb. */
	cooldown_toggle: boolean;
}

/** Body of `PUT /schedule/trainings/{id}/cross_train`. */
export interface CrossTrainRequest {
	/** See `CROSS_TYPES`; typed loosely because that list is incomplete. */
	cross_type: string;
}

export interface Schedule {
	id: number;
	start_day: number;
	start_day_long: string;
	training_week: number;
	type: 'ultimate' | 'other';
	trainings: ScheduledTraining[];
	strength_trainings: StrengthTraining[];
	entries: Entry[];
}

export type DateTrainingMap = {
	[date: `${number}-${number}-${number}`]: {
		training?: ScheduledTraining;
		strengthTraining?: StrengthTraining;
		entry?: Entry;
	};
};

export interface Goal {
	id: number;
	name: string;
	description: string;
	start_date: string;
	end_date: string;
	can_be_edited: boolean;
	created_at: number;
	distance: string;
	distance_unit: string;
	distance_unit_text: string;
	distance_value: number;
	edit_warning: string | null;
	intermediate_goals: Array<{
		id: number;
		name: string;
		date: string;
		distance: string;
		distance_unit: string;
		distance_unit_text: string;
		distance_value: number;
		pace: string;
		pace_unit: string;
		pace_value: number;
		time: string;
		time_in_sec: number;
		time_unit: string;
		time_value: number;
		training_condition: TrainingCondition;
	}>;
	number_of_trainings: number;
	overrule_time: boolean;
	pace: string;
	pace_unit: string;
	pace_value: number;
	time: string;
	time_in_sec: number;
	time_unit: string;
	time_value: number;
	time_type_selected: string;
	training_condition: TrainingCondition;
	training_scheme_type: string;
	week: Array<{
		day: number;
		prior: number;
	}>;
	updated_at: number;
}

export interface UserStats {
	best_times: {
		distance_unit: string;
		pace_unit: string;
		pace_for_5: string;
		time_for_5: string;
		pace_for_10: string;
		time_for_10: string;
		pace_for_half_marathon: string;
		time_for_half_marathon: string;
		pace_for_marathon: string;
		time_for_marathon: string;
		pace_for_goal: string;
		time_for_goal: string;
	};
	flat_stats: Array<{
		title: string;
		icon: string;
		data: Array<{
			title: string;
			value: string;
		}>;
	}>;
	graph_stats: {
		weeks: {
			data: Array<{
				order: number;
				day: string;
				date: string;
				is_today: boolean;
				done: string | null;
				done_value: number | null;
				done_unit: string | null;
				done_unit_text: string | null;
				todo: string | null;
				todo_value: number | null;
				todo_unit: string | null;
				todo_unit_text: string | null;
			}>;
			done: string;
			done_value: number;
			done_unit: string;
			done_unit_text: string;
			todo: string;
			todo_value: number;
			todo_unit: string;
			todo_unit_text: string;
		};
		goal: {
			data: Array<{
				week: number;
				order: number;
				month: string;
				year: number;
				is_current_week: boolean;
				done: string | null;
				done_value: number | null;
				done_unit: string | null;
				done_unit_text: string | null;
				todo: string;
				todo_value: number;
				todo_unit: string;
				todo_unit_text: string;
			}>;
			done: string;
			done_value: number;
			done_unit: string;
			done_unit_text: string;
			todo: string;
			todo_value: number;
			todo_unit: string;
			todo_unit_text: string;
		};
	};
}

export interface NutritionAdvice {
	id: number;
	date: string;
	advice: string;
	title: string;
	description: string;
	plan: Array<{
		type: string;
		order: number;
		icon: string;
		icon_background_color: string;
		title: string;
		percentage: number;
		values: {
			name: string;
			value: number;
			order: number;
			value_unit: string;
		}[];
	}>;
}

export interface Thread {
	id: number;
	type: string;
	total_messages: number;
	unread_messages: number;
	title: string;
	sub_title: string;
	picture: string;
	can_send_messages: boolean;
	last_message?: {
		id: number;
		body: string;
		url: string | null;
		user_id: number;
		picture_url: string;
		created_at: number;
	};
}

export interface Message {
	id: number;
	thread_id: number;
	sender_id: number;
	content: string;
	created_at: string;
	read_at?: string;
}

export interface TestScheduleResponse {
	goal: Goal;
	goal_possible: boolean;
	new_goal_time: number;
}

export interface SaveScheduleResponse {
	id: number;
	start_day: number;
	start_day_long: string;
	training_week: number;
	type: string;
	trainings: ScheduledTraining[];
}

export interface AddEntryResponse {
	id: number;
	name: string;
	start_time: string;
	type: string;
	icon: string;
	total_altitude: number | null;
	avg_heartbeat: number | null;
	rpe: number | null;
	comment: string | null;
	strava: boolean;
	strava_url: string | null;
	garmin: boolean;
	polar: boolean;
	trenara: boolean;
	distance: string;
	distance_value: number;
	distance_unit: string;
	distance_unit_text: string;
	time: string;
	time_in_sec: number;
	time_value: number;
	time_unit: string;
	pace: string;
	pace_value: number;
	pace_unit: string;
	notification: {
		id: number;
		title: string;
		content: string;
		notification_type: string;
		metadata: {
			name: string;
			goal: string;
			type: string;
		};
		training_id: number | null;
		entry_id: number;
		medal_id: number | null;
		created_at: string;
		actions: string[];
	};
}

export interface ChatThread {
	id: number;
	type: string;
	title: string;
	sub_title: string;
	total_messages: number;
	unread_messages: number;
	can_send_messages: boolean;
	disabled: boolean;
	last_message?: {
		id: number;
		body: string;
		body_html: string;
		created_at: number;
		user_id: number;
		picture_url: string;
	};
}

export interface ChatMessage {
	id: number;
	body: string;
	body_html: string;
	created_at: number;
	/**
	 * Author. The coach bot posts as a fixed account (id 3, "Walter"); anything
	 * else is a real user. Compare against the signed-in user's id rather than
	 * assuming a particular responder id.
	 */
	user_id: number;
	/** Always null in the payloads seen so far; purpose unknown. */
	url?: string | null;
	picture_url?: string;
}

export interface ChatMessagesResponse {
	data: ChatMessage[];
	pagination: Pagination;
}

/**
 * Pagination envelope shared by the news and chat-message endpoints.
 *
 * Note `total` is the item count — there is no `total_count` field, despite an
 * earlier guess at this shape saying otherwise.
 */
export interface Pagination {
	total: number;
	count: number;
	per_page: number;
	current_page: number;
	total_pages: number;
	/** `{}` on a single page; `next` appears once there are more. */
	links: {
		next?: string;
		previous?: string;
	};
}

/** A file attached to a news item. */
export interface NewsAttachment {
	id: number;
	path: string;
	original_path: string;
	/** Untyped in every payload seen so far. */
	meta: unknown;
	size_in_kb: number;
	created_at: number;
	/** Untyped and empty in every payload seen so far. */
	custom_properties: unknown[];
}

export interface NewsItem {
	id: number;
	title: string;
	content: string;
	/**
	 * An external link, not necessarily a video and not necessarily embeddable —
	 * Instagram reels, YouTube and Strava links have all appeared here. Treat it
	 * as an opaque URL.
	 */
	video_url: string | null;
	created_at: number;
	attachment: NewsAttachment | null;
}

export interface NewsResponse {
	data: NewsItem[];
	pagination: Pagination;
}
