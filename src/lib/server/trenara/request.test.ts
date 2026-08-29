import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { HttpError, MalformedResponseError, NetworkError, TimeoutError } from './client';
import {
	describeFailure,
	describeUpstreamError,
	isUnreachable,
	parseBody,
	passthrough,
	TIMEOUT_MESSAGE,
	UNREACHABLE_MESSAGE,
	MALFORMED_MESSAGE,
	isUpstreamFailure
} from './request';
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

describe('isUnreachable', () => {
	it('is true for the failures that never got an answer', () => {
		expect(isUnreachable(new NetworkError('Network request failed'))).toBe(true);
		expect(isUnreachable(new TimeoutError())).toBe(true);
	});

	it('is false for an answer, however unwelcome', () => {
		expect(isUnreachable(new HttpError('Server error', 500))).toBe(false);
		expect(isUnreachable(new Error('boom'))).toBe(false);
		expect(isUnreachable(null)).toBe(false);
	});
});

describe('describeFailure', () => {
	// The gateway statuses, because that is what this app is in front of
	// Trenara: they let everything downstream tell "Trenara is down" from
	// "we have a bug", which a 500 for both cannot.
	it('answers a dead connection with 502 and a timeout with 504', () => {
		expect(describeFailure(new NetworkError('Network request failed'))).toEqual({
			status: 502,
			message: UNREACHABLE_MESSAGE
		});
		expect(describeFailure(new TimeoutError())).toEqual({
			status: 504,
			message: TIMEOUT_MESSAGE
		});
	});

	it('relays an upstream refusal with its own status and every field it named', () => {
		const e = new HttpError('Unprocessable', 422, {
			errors: { surface: ['The selected surface is invalid.'] }
		});

		expect(describeFailure(e)).toEqual({
			status: 422,
			message: 'surface: The selected surface is invalid.'
		});
	});

	// `error()` throws on anything outside 400–599, so relaying a status
	// verbatim would crash inside the error path instead of reporting from it.
	it('folds an out-of-range upstream status into one that can be reported', () => {
		expect(describeFailure(new HttpError('Weird', 0)).status).toBe(502);
		expect(describeFailure(new HttpError('Moved', 302)).status).toBe(502);
		expect(describeFailure(new HttpError('Nonsense', 600)).status).toBe(502);
	});

	it('says nothing revealing about a failure it does not recognise', () => {
		const described = describeFailure(new Error('connect ECONNREFUSED 10.0.0.1:5432'));
		expect(described.status).toBe(500);
		expect(described.message).not.toContain('ECONNREFUSED');
	});
});

describe('passthrough', () => {
	/** The status and message a SvelteKit error was thrown with. */
	async function statusOf(fn: () => Promise<unknown>) {
		try {
			await fn();
		} catch (e) {
			return e as { status: number; body: { message: string } };
		}
		throw new Error('expected a failure');
	}

	it('returns the value when the call succeeds', async () => {
		expect(await passthrough(async () => ({ id: 1 }))).toEqual({ id: 1 });
	});

	it('turns an unreachable upstream into a 502 the error page can speak to', async () => {
		const thrown = await statusOf(() =>
			passthrough(() => Promise.reject(new NetworkError('Network request failed')))
		);

		expect(thrown.status).toBe(502);
		expect(thrown.body.message).toBe(UNREACHABLE_MESSAGE);
	});

	it('turns a timeout into a 504', async () => {
		const thrown = await statusOf(() => passthrough(() => Promise.reject(new TimeoutError())));

		expect(thrown.status).toBe(504);
		expect(thrown.body.message).toBe(TIMEOUT_MESSAGE);
	});

	it('passes an upstream refusal through with its own status', async () => {
		const thrown = await statusOf(() =>
			passthrough(() => Promise.reject(new HttpError('Training already moved', 409)))
		);

		expect(thrown.status).toBe(409);
		expect(thrown.body.message).toBe('Training already moved');
	});

	// A bug in this app is not an upstream failure and must not be dressed as
	// one: it goes up untouched, for `handleError` to log.
	it('lets anything else through unchanged', async () => {
		const bug = new TypeError('x is not a function');
		await expect(passthrough(() => Promise.reject(bug))).rejects.toBe(bug);
	});
});

describe('describeFailure on a body that could not be read', () => {
	// 502, the same as an unreachable server, because that is what it is: the
	// answer did not come from the API, whatever served it.
	it('is a 502 that does not blame this app', () => {
		const described = describeFailure(new MalformedResponseError('bad body'));

		expect(described.status).toBe(502);
		expect(described.message).toBe(MALFORMED_MESSAGE);
	});

	// Deliberately not "try again": a maintenance page will keep saying the
	// same thing for as long as it is there.
	it('does not promise a retry will help', () => {
		expect(MALFORMED_MESSAGE).not.toContain('try again');
	});

	it('counts as an upstream failure, so handleError does not call it our bug', () => {
		expect(isUpstreamFailure(new MalformedResponseError('bad body'))).toBe(true);
		expect(isUpstreamFailure(new NetworkError('down'))).toBe(true);
		expect(isUpstreamFailure(new TypeError('x is not a function'))).toBe(false);
	});
});
