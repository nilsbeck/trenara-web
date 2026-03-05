import { describe, it, expect } from 'vitest';
import { addTrainingSchema, feedbackSchema, changeDateSchema } from './training';

// ─────────────────────────────────────────────────────────────
// addTrainingSchema
// ─────────────────────────────────────────────────────────────
describe('addTrainingSchema', () => {
	const valid = {
		name: 'Morning run',
		timeInSeconds: 3600,
		date: '2025-03-05',
		distanceInKm: 10
	};

	it('accepts valid input', () => {
		expect(addTrainingSchema.safeParse(valid).success).toBe(true);
	});

	it('rejects empty name', () => {
		const result = addTrainingSchema.safeParse({ ...valid, name: '' });
		expect(result.success).toBe(false);
	});

	it('rejects non-positive timeInSeconds', () => {
		expect(addTrainingSchema.safeParse({ ...valid, timeInSeconds: 0 }).success).toBe(false);
		expect(addTrainingSchema.safeParse({ ...valid, timeInSeconds: -1 }).success).toBe(false);
	});

	it('rejects fractional timeInSeconds', () => {
		expect(addTrainingSchema.safeParse({ ...valid, timeInSeconds: 1.5 }).success).toBe(false);
	});

	it('rejects non-positive distanceInKm', () => {
		expect(addTrainingSchema.safeParse({ ...valid, distanceInKm: 0 }).success).toBe(false);
		expect(addTrainingSchema.safeParse({ ...valid, distanceInKm: -5 }).success).toBe(false);
	});

	it('allows fractional distanceInKm', () => {
		expect(addTrainingSchema.safeParse({ ...valid, distanceInKm: 5.5 }).success).toBe(true);
	});

	it('rejects missing fields', () => {
		expect(addTrainingSchema.safeParse({}).success).toBe(false);
	});
});

// ─────────────────────────────────────────────────────────────
// feedbackSchema
// ─────────────────────────────────────────────────────────────
describe('feedbackSchema', () => {
	it('accepts valid RPE = 5', () => {
		expect(feedbackSchema.safeParse({ entryId: 1, feedback: 5 }).success).toBe(true);
	});

	it('accepts minimum RPE = 1', () => {
		expect(feedbackSchema.safeParse({ entryId: 1, feedback: 1 }).success).toBe(true);
	});

	it('accepts maximum RPE = 10', () => {
		expect(feedbackSchema.safeParse({ entryId: 1, feedback: 10 }).success).toBe(true);
	});

	it('rejects RPE = 0 (below minimum)', () => {
		expect(feedbackSchema.safeParse({ entryId: 1, feedback: 0 }).success).toBe(false);
	});

	it('rejects RPE = 11 (above maximum)', () => {
		expect(feedbackSchema.safeParse({ entryId: 1, feedback: 11 }).success).toBe(false);
	});

	it('rejects fractional RPE', () => {
		expect(feedbackSchema.safeParse({ entryId: 1, feedback: 5.5 }).success).toBe(false);
	});

	it('rejects non-positive entryId', () => {
		expect(feedbackSchema.safeParse({ entryId: 0, feedback: 5 }).success).toBe(false);
		expect(feedbackSchema.safeParse({ entryId: -1, feedback: 5 }).success).toBe(false);
	});

	it('rejects missing fields', () => {
		expect(feedbackSchema.safeParse({}).success).toBe(false);
		expect(feedbackSchema.safeParse({ entryId: 1 }).success).toBe(false);
	});
});

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
