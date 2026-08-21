import { describe, it, expect } from 'vitest';
import { feedbackSchema, changeDateSchema } from './training';

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
