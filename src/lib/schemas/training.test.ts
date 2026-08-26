import { describe, it, expect } from 'vitest';
import {
	changeDateSchema,
	trainingConditionSchema,
	setIntensitySchema,
	setDistanceSchema,
	setShoeSchema,
	setCooldownSchema,
	crossTrainSchema,
	exchangeTrainingSchema,
	setPacingPlanSchema
} from './training';

// ─────────────────────────────────────────────────────────────
// changeDateSchema
// ─────────────────────────────────────────────────────────────
describe('changeDateSchema', () => {
	const valid = {
		entryId: 42,
		newDate: '2025-06-01T00:00:00.000Z',
		includeFuture: false,
		action: 'save' as const
	};

	it('accepts valid input', () => {
		expect(changeDateSchema.safeParse(valid).success).toBe(true);
	});

	it('defaults includeFuture to false when omitted', () => {
		const result = changeDateSchema.safeParse({
			entryId: 1,
			newDate: '2025-06-01T00:00:00.000Z'
		});
		expect(result.success).toBe(true);
		if (result.success) expect(result.data.includeFuture).toBe(false);
	});

	it('defaults action to "save" when omitted', () => {
		const result = changeDateSchema.safeParse({
			entryId: 1,
			newDate: '2025-06-01T00:00:00.000Z'
		});
		expect(result.success).toBe(true);
		if (result.success) expect(result.data.action).toBe('save');
	});

	it('accepts action = "test"', () => {
		expect(changeDateSchema.safeParse({ ...valid, action: 'test' }).success).toBe(true);
	});

	it('rejects invalid action value', () => {
		expect(changeDateSchema.safeParse({ ...valid, action: 'delete' }).success).toBe(false);
	});

	it('rejects non-positive entryId', () => {
		expect(changeDateSchema.safeParse({ ...valid, entryId: 0 }).success).toBe(false);
	});

	it('rejects missing entryId', () => {
		const { entryId: _, ...rest } = valid;
		expect(changeDateSchema.safeParse(rest).success).toBe(false);
	});

	it('rejects missing newDate', () => {
		const { newDate: _, ...rest } = valid;
		expect(changeDateSchema.safeParse(rest).success).toBe(false);
	});
});

// ─────────────────────────────────────────────────────────────
// Session setup
// ─────────────────────────────────────────────────────────────
describe('trainingConditionSchema', () => {
	it('accepts a surface and elevation the API is known to take', () => {
		const result = trainingConditionSchema.safeParse({
			surface: 'treadmill',
			heightDifference: 'lights'
		});
		expect(result.success).toBe(true);
		// The numeric elevation is optional; nothing sends it yet.
		expect(result.success && result.data.heightValue).toBe(0);
		expect(result.success && result.data.heightUnit).toBe('m');
	});

	it('rejects a surface the API has never been seen to accept', () => {
		expect(
			trainingConditionSchema.safeParse({ surface: 'gravel', heightDifference: 'flat' }).success
		).toBe(false);
	});

	it('rejects "light" — the API spells it "lights"', () => {
		expect(
			trainingConditionSchema.safeParse({ surface: 'road', heightDifference: 'light' }).success
		).toBe(false);
	});

	it('requires both halves, since they post in one call', () => {
		expect(trainingConditionSchema.safeParse({ surface: 'road' }).success).toBe(false);
	});
});

describe('setIntensitySchema / setDistanceSchema', () => {
	it('accepts a negative percentage delta', () => {
		expect(setIntensitySchema.safeParse({ intensityValue: -4 }).success).toBe(true);
		expect(setDistanceSchema.safeParse({ distanceValue: -30 }).success).toBe(true);
	});

	it('accepts zero, which is "as planned" rather than "no change requested"', () => {
		expect(setIntensitySchema.safeParse({ intensityValue: 0 }).success).toBe(true);
	});

	it('rejects a fractional step — the packages only ever send integers', () => {
		expect(setIntensitySchema.safeParse({ intensityValue: -2.5 }).success).toBe(false);
	});

	it('rejects a delta outside any plausible package range', () => {
		expect(setDistanceSchema.safeParse({ distanceValue: -300 }).success).toBe(false);
	});
});

describe('setShoeSchema', () => {
	it('accepts a shoe id', () => {
		expect(setShoeSchema.safeParse({ shoeId: 6404 }).success).toBe(true);
	});

	it('rejects a missing or non-positive id', () => {
		expect(setShoeSchema.safeParse({}).success).toBe(false);
		expect(setShoeSchema.safeParse({ shoeId: 0 }).success).toBe(false);
	});
});

describe('crossTrainSchema', () => {
	it('accepts every cross type captured so far', () => {
		expect(crossTrainSchema.safeParse({ crossType: 'road_bike' }).success).toBe(true);
		expect(crossTrainSchema.safeParse({ crossType: 'mountain_bike' }).success).toBe(true);
		expect(crossTrainSchema.safeParse({ crossType: 'indoor_cycling' }).success).toBe(true);
		expect(crossTrainSchema.safeParse({ crossType: 'swimming' }).success).toBe(true);
		expect(crossTrainSchema.safeParse({ crossType: 'crosstrainer' }).success).toBe(true);
		expect(crossTrainSchema.safeParse({ crossType: 'elliptical' }).success).toBe(true);
	});

	it('accepts a cross type we have not, because the list is incomplete', () => {
		// Refusing an unseen value would break a feature the backend supports.
		expect(crossTrainSchema.safeParse({ crossType: 'rowing' }).success).toBe(true);
	});

	it('accepts null, which is how the session goes back to being a run', () => {
		expect(crossTrainSchema.safeParse({ crossType: null }).success).toBe(true);
	});

	it('still rejects an empty string, which means nothing', () => {
		// Null says "no cross type"; "" is a value that failed to be one.
		expect(crossTrainSchema.safeParse({ crossType: '' }).success).toBe(false);
	});

	it('still requires the field to be present', () => {
		expect(crossTrainSchema.safeParse({}).success).toBe(false);
	});
});

describe('exchangeTrainingSchema', () => {
	it('accepts a candidate id', () => {
		expect(exchangeTrainingSchema.safeParse({ candidateId: 20112 }).success).toBe(true);
	});

	it('rejects a body naming the field the way the upstream API does', () => {
		// Upstream calls it training_id, which is easy to confuse with the
		// scheduled training in the path. The schema forces the distinction.
		expect(exchangeTrainingSchema.safeParse({ training_id: 20112 }).success).toBe(false);
	});
});

describe('setPacingPlanSchema', () => {
	it('accepts the two named strategies', () => {
		expect(setPacingPlanSchema.safeParse({ pacingPlan: 'trenara' }).success).toBe(true);
		expect(setPacingPlanSchema.safeParse({ pacingPlan: 'alternative' }).success).toBe(true);
	});

	it('accepts null, which is "no pacing plan" rather than an unset field', () => {
		expect(setPacingPlanSchema.safeParse({ pacingPlan: null }).success).toBe(true);
	});

	it('rejects a strategy the package has never offered', () => {
		// Unlike crossTrainSchema, this stays strict: the package that would
		// carry a third strategy is the only source of truth for what to send,
		// and it has been captured on one session only.
		expect(setPacingPlanSchema.safeParse({ pacingPlan: 'even' }).success).toBe(false);
	});

	it('still requires the field to be present', () => {
		expect(setPacingPlanSchema.safeParse({}).success).toBe(false);
	});
});

describe('setCooldownSchema', () => {
	it('takes the target state', () => {
		expect(setCooldownSchema.safeParse({ hasCooldown: false }).success).toBe(true);
		expect(setCooldownSchema.safeParse({ hasCooldown: true }).success).toBe(true);
	});

	it('rejects anything but a boolean, so "toggle" cannot be expressed', () => {
		expect(setCooldownSchema.safeParse({ hasCooldown: 'false' }).success).toBe(false);
		expect(setCooldownSchema.safeParse({}).success).toBe(false);
	});
});

describe('trainingConditionSchema climb', () => {
	it('takes metres of ascent', () => {
		const result = trainingConditionSchema.safeParse({
			surface: 'single_track',
			heightDifference: 'strong',
			heightValue: 450
		});
		expect(result.success && result.data.heightValue).toBe(450);
	});

	it('rejects a negative climb', () => {
		expect(
			trainingConditionSchema.safeParse({
				surface: 'road',
				heightDifference: 'flat',
				heightValue: -10
			}).success
		).toBe(false);
	});

	it('rejects a climb no session could have', () => {
		// A mistyped number should not reach Trenara.
		expect(
			trainingConditionSchema.safeParse({
				surface: 'road',
				heightDifference: 'mountain',
				heightValue: 99999999
			}).success
		).toBe(false);
	});
});
