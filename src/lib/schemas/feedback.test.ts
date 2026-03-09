import { describe, it, expect } from 'vitest';
import { rpeFeedbackSchema } from './feedback';

// ─────────────────────────────────────────────────────────────
// rpeFeedbackSchema
// ─────────────────────────────────────────────────────────────
describe('rpeFeedbackSchema', () => {
	it('accepts valid feedback', () => {
		expect(rpeFeedbackSchema.safeParse({ entryId: 1, feedback: 5 }).success).toBe(true);
	});

	it('accepts minimum feedback = 1', () => {
		expect(rpeFeedbackSchema.safeParse({ entryId: 1, feedback: 1 }).success).toBe(true);
	});

	it('accepts maximum feedback = 10', () => {
		expect(rpeFeedbackSchema.safeParse({ entryId: 1, feedback: 10 }).success).toBe(true);
	});

	it('rejects feedback = 0', () => {
		expect(rpeFeedbackSchema.safeParse({ entryId: 1, feedback: 0 }).success).toBe(false);
	});

	it('rejects feedback = 11', () => {
		expect(rpeFeedbackSchema.safeParse({ entryId: 1, feedback: 11 }).success).toBe(false);
	});

	it('rejects fractional feedback', () => {
		expect(rpeFeedbackSchema.safeParse({ entryId: 1, feedback: 5.5 }).success).toBe(false);
	});

	it('rejects non-positive entryId', () => {
		expect(rpeFeedbackSchema.safeParse({ entryId: 0, feedback: 5 }).success).toBe(false);
		expect(rpeFeedbackSchema.safeParse({ entryId: -1, feedback: 5 }).success).toBe(false);
	});

	it('rejects fractional entryId', () => {
		expect(rpeFeedbackSchema.safeParse({ entryId: 1.5, feedback: 5 }).success).toBe(false);
	});

	it('rejects missing fields', () => {
		expect(rpeFeedbackSchema.safeParse({}).success).toBe(false);
		expect(rpeFeedbackSchema.safeParse({ entryId: 1 }).success).toBe(false);
		expect(rpeFeedbackSchema.safeParse({ feedback: 5 }).success).toBe(false);
	});
});
