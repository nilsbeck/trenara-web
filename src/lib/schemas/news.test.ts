import { describe, it, expect } from 'vitest';
import { newsMarkReadSchema, newsPageSchema } from './news';

const VALID = { lastSeenId: 82, lastSeenCreatedAt: 1_750_000_000 };

describe('newsMarkReadSchema', () => {
	it('accepts a mark', () => {
		expect(newsMarkReadSchema.safeParse(VALID).success).toBe(true);
	});

	it('rejects a missing timestamp', () => {
		expect(newsMarkReadSchema.safeParse({ lastSeenId: 82 }).success).toBe(false);
	});

	it('rejects a non-positive id', () => {
		expect(newsMarkReadSchema.safeParse({ ...VALID, lastSeenId: 0 }).success).toBe(false);
	});

	it('rejects milliseconds sent as seconds', () => {
		expect(newsMarkReadSchema.safeParse({ ...VALID, lastSeenCreatedAt: Date.now() }).success).toBe(
			false
		);
	});

	it('rejects a fractional timestamp', () => {
		expect(newsMarkReadSchema.safeParse({ ...VALID, lastSeenCreatedAt: 1.5 }).success).toBe(false);
	});
});

describe('newsPageSchema', () => {
	it('defaults to the first page', () => {
		expect(newsPageSchema.parse(undefined)).toBe(1);
	});

	it('coerces the query string', () => {
		expect(newsPageSchema.parse('3')).toBe(3);
	});

	it('rejects page 0', () => {
		expect(newsPageSchema.safeParse('0').success).toBe(false);
	});

	it('rejects a non-numeric page', () => {
		expect(newsPageSchema.safeParse('first').success).toBe(false);
	});
});
