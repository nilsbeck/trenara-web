import { describe, it, expect } from 'vitest';
import { HttpError } from './client';
import { describeUpstreamError } from './request';

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
