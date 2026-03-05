import { describe, it, expect } from 'vitest';
import { predictionRecordSchema, predictionHistoryQuerySchema } from './prediction';

// ─────────────────────────────────────────────────────────────
// predictionRecordSchema
// ─────────────────────────────────────────────────────────────
describe('predictionRecordSchema', () => {
	it('accepts HH:MM:SS time and MM:SS pace', () => {
		expect(predictionRecordSchema.safeParse({ time: '1:30:00', pace: '5:30' }).success).toBe(true);
	});

	it('accepts H:MM:SS (single-digit hour)', () => {
		expect(predictionRecordSchema.safeParse({ time: '3:45:00', pace: '5:20' }).success).toBe(true);
	});

	it('accepts MM:SS time (without hours)', () => {
		expect(predictionRecordSchema.safeParse({ time: '45:00', pace: '4:30' }).success).toBe(true);
	});

	it('accepts H:MM as a valid time (the seconds part is optional per the regex)', () => {
		// The regex allows MM:SS or HH:MM:SS — a bare H:MM is treated as MM:SS.
		expect(predictionRecordSchema.safeParse({ time: '1:30', pace: '5:30' }).success).toBe(true);
	});

	it('rejects time with extra parts', () => {
		expect(predictionRecordSchema.safeParse({ time: '1:30:00:00', pace: '5:30' }).success).toBe(
			false
		);
	});

	it('rejects non-numeric time', () => {
		expect(predictionRecordSchema.safeParse({ time: 'abc', pace: '5:30' }).success).toBe(false);
	});

	it('rejects pace with seconds (HH:MM:SS not allowed)', () => {
		expect(predictionRecordSchema.safeParse({ time: '1:30:00', pace: '5:30:00' }).success).toBe(
			false
		);
	});

	it('rejects non-numeric pace', () => {
		expect(predictionRecordSchema.safeParse({ time: '1:30:00', pace: 'fast' }).success).toBe(false);
	});

	it('rejects missing fields', () => {
		expect(predictionRecordSchema.safeParse({}).success).toBe(false);
		expect(predictionRecordSchema.safeParse({ time: '1:30:00' }).success).toBe(false);
		expect(predictionRecordSchema.safeParse({ pace: '5:30' }).success).toBe(false);
	});
});

// ─────────────────────────────────────────────────────────────
// predictionHistoryQuerySchema
// ─────────────────────────────────────────────────────────────
describe('predictionHistoryQuerySchema', () => {
	it('accepts all optional fields omitted', () => {
		const result = predictionHistoryQuerySchema.safeParse({});
		expect(result.success).toBe(true);
	});

	it('defaults limit to 100 when omitted', () => {
		const result = predictionHistoryQuerySchema.safeParse({});
		expect(result.success).toBe(true);
		if (result.success) expect(result.data.limit).toBe(100);
	});

	it('coerces limit from string to number', () => {
		const result = predictionHistoryQuerySchema.safeParse({ limit: '50' });
		expect(result.success).toBe(true);
		if (result.success) expect(result.data.limit).toBe(50);
	});

	it('accepts valid start_date and end_date', () => {
		const result = predictionHistoryQuerySchema.safeParse({
			start_date: '2025-01-01',
			end_date: '2025-12-31'
		});
		expect(result.success).toBe(true);
	});

	it('rejects invalid date format for start_date', () => {
		expect(
			predictionHistoryQuerySchema.safeParse({ start_date: '01/01/2025' }).success
		).toBe(false);
	});

	it('rejects limit above 500', () => {
		expect(predictionHistoryQuerySchema.safeParse({ limit: '501' }).success).toBe(false);
	});

	it('rejects limit of 0', () => {
		expect(predictionHistoryQuerySchema.safeParse({ limit: '0' }).success).toBe(false);
	});

	it('rejects negative limit', () => {
		expect(predictionHistoryQuerySchema.safeParse({ limit: '-1' }).success).toBe(false);
	});

	it('accepts limit at boundary: 1', () => {
		const result = predictionHistoryQuerySchema.safeParse({ limit: '1' });
		expect(result.success).toBe(true);
	});

	it('accepts limit at boundary: 500', () => {
		const result = predictionHistoryQuerySchema.safeParse({ limit: '500' });
		expect(result.success).toBe(true);
	});
});
