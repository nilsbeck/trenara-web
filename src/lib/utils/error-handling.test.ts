import { describe, it, expect, vi } from 'vitest';
import { AppError, ApiResponseError, handleError, logError } from './error-handling';

// ─────────────────────────────────────────────────────────────
// AppError
// ─────────────────────────────────────────────────────────────
describe('AppError', () => {
	it('sets message, default status 500, and name', () => {
		const err = new AppError('boom');
		expect(err.message).toBe('boom');
		expect(err.status).toBe(500);
		expect(err.code).toBeUndefined();
		expect(err.name).toBe('AppError');
		expect(err).toBeInstanceOf(Error);
	});

	it('accepts custom status and code', () => {
		const err = new AppError('not found', 404, 'NOT_FOUND');
		expect(err.status).toBe(404);
		expect(err.code).toBe('NOT_FOUND');
	});
});

// ─────────────────────────────────────────────────────────────
// ApiResponseError
// ─────────────────────────────────────────────────────────────
describe('ApiResponseError', () => {
	it('extends AppError with code API_ERROR', () => {
		const err = new ApiResponseError('bad gateway', 502);
		expect(err.message).toBe('bad gateway');
		expect(err.status).toBe(502);
		expect(err.code).toBe('API_ERROR');
		expect(err.name).toBe('ApiResponseError');
		expect(err).toBeInstanceOf(AppError);
	});
});

// ─────────────────────────────────────────────────────────────
// handleError
// ─────────────────────────────────────────────────────────────
describe('handleError', () => {
	it('returns AppError as-is', () => {
		const original = new AppError('known', 400);
		expect(handleError(original)).toBe(original);
	});

	it('returns ApiResponseError as-is (subclass of AppError)', () => {
		const original = new ApiResponseError('api fail', 503);
		expect(handleError(original)).toBe(original);
	});

	it('wraps a plain Error into an AppError', () => {
		const result = handleError(new Error('plain'));
		expect(result).toBeInstanceOf(AppError);
		expect(result.message).toBe('plain');
		expect(result.status).toBe(500);
	});

	it('wraps a non-Error value into a generic AppError', () => {
		const result = handleError('string error');
		expect(result).toBeInstanceOf(AppError);
		expect(result.message).toBe('An unexpected error occurred');
	});

	it('wraps null/undefined into a generic AppError', () => {
		expect(handleError(null).message).toBe('An unexpected error occurred');
		expect(handleError(undefined).message).toBe('An unexpected error occurred');
	});
});

// ─────────────────────────────────────────────────────────────
// logError
// ─────────────────────────────────────────────────────────────
describe('logError', () => {
	it('logs error message to console.error', () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		logError(new Error('test'));
		expect(spy).toHaveBeenCalledWith('[Error]:', 'test');
		spy.mockRestore();
	});

	it('includes context in the log prefix', () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		logError(new Error('oops'), 'fetchData');
		expect(spy).toHaveBeenCalledWith('[Error in fetchData]:', 'oops');
		spy.mockRestore();
	});
});
