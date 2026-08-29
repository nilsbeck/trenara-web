import { describe, it, expect, afterEach, vi } from 'vitest';
import {
	describeError,
	describeResponse,
	EXPIRED_MESSAGE,
	isAbort,
	isConnectionFailure,
	isOffline,
	isUnreachableStatus,
	OFFLINE_MESSAGE,
	responseMessage,
	statusMessage,
	TIMEOUT_MESSAGE,
	UNREACHABLE_MESSAGE
} from './network';

/** A response like the ones `/api/v1` returns for a failure. */
function failedResponse(status: number, body: unknown = null): Response {
	return {
		ok: false,
		status,
		json: () => (body === null ? Promise.reject(new SyntaxError('no body')) : Promise.resolve(body))
	} as unknown as Response;
}

/** Pretend the browser knows it has no connection. */
function goOffline(online: boolean) {
	vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(online);
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe('isConnectionFailure', () => {
	// One dead connection, three browsers, three different sentences — and all
	// three used to be shown to the runner verbatim.
	it('recognises how each browser words a dropped connection', () => {
		expect(isConnectionFailure(new TypeError('Failed to fetch'))).toBe(true);
		expect(isConnectionFailure(new TypeError('Load failed'))).toBe(true);
		expect(
			isConnectionFailure(new TypeError('NetworkError when attempting to fetch resource.'))
		).toBe(true);
	});

	it('does not mistake a programming error for one', () => {
		expect(isConnectionFailure(new TypeError('x.map is not a function'))).toBe(false);
		expect(isConnectionFailure(new Error('Failed to fetch'))).toBe(false);
		expect(isConnectionFailure('Failed to fetch')).toBe(false);
	});
});

describe('isAbort', () => {
	it('is true only for a called-off request', () => {
		expect(isAbort(new DOMException('aborted', 'AbortError'))).toBe(true);
		expect(isAbort(new DOMException('gone', 'NotFoundError'))).toBe(false);
		expect(isAbort(new Error('aborted'))).toBe(false);
	});
});

describe('isOffline', () => {
	it('follows what the browser reports', () => {
		goOffline(false);
		expect(isOffline()).toBe(true);

		goOffline(true);
		expect(isOffline()).toBe(false);
	});
});

describe('describeError', () => {
	it('says so when the browser knows there is no connection', () => {
		goOffline(false);
		expect(describeError(new TypeError('Failed to fetch'), 'Could not save.')).toBe(
			OFFLINE_MESSAGE
		);
	});

	// Online but unreachable is the mid-run case: a bar of signal that does not
	// carry anything. It is a different sentence from being plainly offline.
	it('says the server could not be reached when the browser thinks it is online', () => {
		goOffline(true);
		expect(describeError(new TypeError('Failed to fetch'), 'Could not save.')).toBe(
			UNREACHABLE_MESSAGE
		);
	});

	it('keeps a message that was written for the user', () => {
		expect(describeError(new Error('The session has already been rated.'), 'Could not save.')).toBe(
			'The session has already been rated.'
		);
	});

	it('falls back for a thrown value that is not an error at all', () => {
		expect(describeError('nope', 'Could not save.')).toBe('Could not save.');
		expect(describeError(new Error(''), 'Could not save.')).toBe('Could not save.');
	});
});

describe('responseMessage', () => {
	it('reads the message the endpoint sent', async () => {
		expect(
			await responseMessage(failedResponse(422, { message: 'The date is in the past.' }))
		).toBe('The date is in the past.');
	});

	it('is null when there is nothing worth showing', async () => {
		expect(await responseMessage(failedResponse(500))).toBeNull();
		expect(await responseMessage(failedResponse(500, { message: '   ' }))).toBeNull();
		expect(await responseMessage(failedResponse(500, { error: 'boom' }))).toBeNull();
	});
});

describe('statusMessage', () => {
	// These two are the app's own way of saying the failure was between it and
	// Trenara, so they get an answer that does not read like a bug.
	it('turns the gateway statuses into something about the connection', () => {
		expect(statusMessage(502, 'Could not save.')).toBe(UNREACHABLE_MESSAGE);
		expect(statusMessage(503, 'Could not save.')).toBe(UNREACHABLE_MESSAGE);
		expect(statusMessage(504, 'Could not save.')).toBe(TIMEOUT_MESSAGE);
		expect(statusMessage(408, 'Could not save.')).toBe(TIMEOUT_MESSAGE);
	});

	it('tells an expired session apart from a failure', () => {
		expect(statusMessage(401, 'Could not save.')).toBe(EXPIRED_MESSAGE);
	});

	it('keeps the status on anything else, since it is all there is to go on', () => {
		expect(statusMessage(500, 'Could not save.')).toBe('Could not save. (500)');
	});
});

describe('describeResponse', () => {
	it('prefers what the endpoint said over what the status implies', async () => {
		const res = failedResponse(502, { message: 'Trenara could not be reached. Please try again.' });
		expect(await describeResponse(res, 'Could not save.')).toBe(
			'Trenara could not be reached. Please try again.'
		);
	});

	it('falls back to the status when the body says nothing', async () => {
		expect(await describeResponse(failedResponse(504), 'Could not save.')).toBe(TIMEOUT_MESSAGE);
		expect(await describeResponse(failedResponse(500), 'Could not save.')).toBe(
			'Could not save. (500)'
		);
	});
});

describe('isUnreachableStatus', () => {
	it('covers the statuses that mean the connection, not the request', () => {
		expect([408, 502, 503, 504].every(isUnreachableStatus)).toBe(true);
		expect([400, 401, 404, 409, 422, 500].some(isUnreachableStatus)).toBe(false);
	});
});
