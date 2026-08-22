import { z } from 'zod';
import { TRAINING_SURFACES, TRAINING_HEIGHT_DIFFERENCES } from '$lib/server/trenara/types';

export const feedbackSchema = z.object({
	entryId: z.number().int().positive(),
	feedback: z.number().int().min(1).max(10)
});

export const changeDateSchema = z.object({
	entryId: z.number().int().positive(),
	newDate: z.string(),
	includeFuture: z.boolean().default(false),
	action: z.enum(['test', 'save']).default('save')
});

// ── Session setup ──────────────────────────────────────────────────
//
// Every mutation below is gated server-side by a `can_*` flag on the
// training detail. These schemas only check the shape; whether the change
// is allowed at all is Trenara's call, and its rejection is passed through.

/**
 * Terrain for one training. Surface and elevation post together in a single
 * call, so they validate together.
 *
 * `heightValue` is the numeric elevation the API also accepts alongside the
 * preset. Nothing sends it yet — see the design notes — so it defaults to 0.
 */
export const trainingConditionSchema = z.object({
	surface: z.enum(TRAINING_SURFACES),
	heightDifference: z.enum(TRAINING_HEIGHT_DIFFERENCES),
	// Metres of climb. Capped well above any real session — the point is to stop
	// a mistyped 99999999 reaching Trenara, not to judge anyone's route.
	heightValue: z.number().nonnegative().finite().max(30000).default(0),
	heightUnit: z.string().min(1).max(8).default('m')
});

/**
 * A step from `change_intensity_package` / `change_distance_package`.
 *
 * Both are percentage deltas, not absolute values, and the coach caps the
 * range per training. The bound here is a sanity check only: the authoritative
 * list of steps is the one the server sent with the training.
 */
const changeStepValue = z.number().int().min(-100).max(100);

export const setIntensitySchema = z.object({ intensityValue: changeStepValue });
export const setDistanceSchema = z.object({ distanceValue: changeStepValue });

export const setShoeSchema = z.object({ shoeId: z.number().int().positive() });

/**
 * Whether the training should keep its cool-down.
 *
 * An explicit target rather than a toggle: two taps racing each other would
 * otherwise land on whichever order the server happened to process.
 */
export const setCooldownSchema = z.object({ hasCooldown: z.boolean() });

/**
 * `cross_type` is a plain string on purpose. CROSS_TYPES lists only the values
 * we have observed and the real list is longer — the app offers seven — so
 * refusing an unseen value would break a feature the backend already supports.
 *
 * `null` means "back to a run", which the app offers from the same picker.
 */
export const crossTrainSchema = z.object({
	crossType: z.string().min(1).max(64).nullable()
});

/** A candidate id from `GET .../exchange` — a different id space to the training. */
export const exchangeTrainingSchema = z.object({ candidateId: z.number().int().positive() });

export type FeedbackData = z.infer<typeof feedbackSchema>;
export type ChangeDateData = z.infer<typeof changeDateSchema>;
export type TrainingConditionData = z.infer<typeof trainingConditionSchema>;
export type SetIntensityData = z.infer<typeof setIntensitySchema>;
export type SetDistanceData = z.infer<typeof setDistanceSchema>;
export type SetShoeData = z.infer<typeof setShoeSchema>;
export type SetCooldownData = z.infer<typeof setCooldownSchema>;
export type CrossTrainData = z.infer<typeof crossTrainSchema>;
export type ExchangeTrainingData = z.infer<typeof exchangeTrainingSchema>;
