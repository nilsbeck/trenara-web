import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { HttpError } from './client';
import { describeUpstreamError, parseBody } from './request';
import { trainingConditionSchema } from '$lib/schemas/training';
import { SURFACES } from '$lib/utils/session-setup';

describe('describeUpstreamError', () => {
	it('names every field a rejected write complained about', () => {
		// The summary hides all but the first, which against a reverse-engineered
		// API throws away the only part that says what to change.
		const e = new HttpError('The height field must be a string. (and 1 more error)', 422, {
			message: 'The height field must be a string. (and 1 more error)',
			errors: {
				height: ['The height field must be a string.'],
				height_unit: ['The height unit field is required.']
			}
		});

		const described = describeUpstreamError(e);
		expect(described).toContain('height: The height field must be a string.');
		expect(described).toContain('height_unit: The height unit field is required.');
		expect(described).not.toContain('and 1 more error');
	});

	it('joins several messages for one field', () => {
		const e = new HttpError('Invalid', 422, {
			errors: { height_difference: ['The field is required.', 'The selection is invalid.'] }
		});
		expect(describeUpstreamError(e)).toBe(
			'height_difference: The field is required. The selection is invalid.'
		);
	});

	it('falls back to the message when there is no field map', () => {
		expect(describeUpstreamError(new HttpError('Not Found', 404))).toBe('Not Found');
		expect(describeUpstreamError(new HttpError('Server error', 500, { message: 'x' }))).toBe(
			'Server error'
		);
	});

	it('falls back when the field map is empty rather than saying nothing', () => {
		expect(describeUpstreamError(new HttpError('Unprocessable', 422, { errors: {} }))).toBe(
			'Unprocessable'
		);
	});
});

describe('parseBody', () => {
	const schema = z.object({
		surface: z.enum(['road', 'track']),
		heightValue: z.number().nonnegative().default(0)
	});

	it('returns the parsed body, defaults filled in', () => {
		expect(parseBody(schema, { surface: 'track' })).toEqual({ surface: 'track', heightValue: 0 });
	});

	it('names the field and the value that arrived', () => {
		// "Invalid request body" cannot tell a client sending a stale enum value
		// apart from a broken endpoint, and this app is its own client: the value
		// in the message is what identifies which of the two it is.
		try {
			parseBody(schema, { surface: 'athletics_track' });
			expect.unreachable('should have thrown');
		} catch (e) {
			const { body } = e as { body: { message: string } };
			expect(body.message).toContain('surface');
			expect(body.message).toContain('"athletics_track"');
			expect(body.message).toContain('track');
		}
	});

	it('says a missing field is missing rather than showing nothing', () => {
		try {
			parseBody(schema, {});
			expect.unreachable('should have thrown');
		} catch (e) {
			expect((e as { body: { message: string } }).body.message).toContain('got nothing');
		}
	});

	it('describes a value too big to quote by its type', () => {
		try {
			parseBody(schema, { surface: { nested: 'object' } });
			expect.unreachable('should have thrown');
		} catch (e) {
			expect((e as { body: { message: string } }).body.message).toContain('got an object');
		}
	});

	it('answers 400, so a bad body is not a server fault', () => {
		try {
			parseBody(schema, { surface: 'road', heightValue: -1 });
			expect.unreachable('should have thrown');
		} catch (e) {
			expect((e as { status: number }).status).toBe(400);
		}
	});
});

describe('the terrain body the picker composes', () => {
	it('accepts every surface the picker offers', () => {
		// The picker's list and the endpoint's whitelist are two halves of one
		// setting: a value in one and not the other is a button that answers 400.
		for (const surface of SURFACES) {
			const parsed = trainingConditionSchema.safeParse({
				surface: surface.value,
				heightDifference: 'flat',
				heightValue: 0
			});
			expect(parsed.success, `${surface.value} is not accepted`).toBe(true);
		}
	});
});
