import { describe, it, expect, vi, afterEach } from 'vitest';
import {
	DatabaseError,
	fromStorage,
	isDatabaseError,
	storageFailed,
	STORAGE_READ_MESSAGE,
	STORAGE_WRITE_MESSAGE
} from './errors';

afterEach(() => {
	vi.restoreAllMocks();
});

/** The status and body a SvelteKit error was thrown with. */
async function thrownBy(fn: () => Promise<unknown>) {
	try {
		await fn();
	} catch (e) {
		return e as { status: number; body: { message: string; storage?: boolean } };
	}
	throw new Error('expected a failure');
}

describe('storageFailed', () => {
	it('names the operation for the log', () => {
		expect(() => storageFailed('goal history read', { message: 'connection refused' })).toThrow(
			DatabaseError
		);

		try {
			storageFailed('goal history read', { message: 'connection refused' });
		} catch (e) {
			expect((e as DatabaseError).operation).toBe('goal history read');
			expect((e as DatabaseError).message).toContain('connection refused');
		}
	});

	it('copes with a failure that came with no message', () => {
		expect(() => storageFailed('goal archive')).toThrow(DatabaseError);
		expect(() => storageFailed('goal archive', null)).toThrow(DatabaseError);
	});
});

describe('isDatabaseError', () => {
	it('is true only for a storage failure', () => {
		expect(isDatabaseError(new DatabaseError('read'))).toBe(true);
		expect(isDatabaseError(new Error('read'))).toBe(false);
		expect(isDatabaseError(null)).toBe(false);
	});
});

describe('fromStorage', () => {
	it('returns the value when the call succeeds', async () => {
		expect(await fromStorage(async () => [{ id: 1 }])).toEqual([{ id: 1 }]);
	});

	// 503 and a flag, not the 502 an unreachable Trenara gets: they are two
	// different servers, and naming the wrong one sends the runner to check a
	// service that is working perfectly.
	it('answers a storage failure with a 503 marked as storage', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});

		const thrown = await thrownBy(() =>
			fromStorage(() => Promise.reject(new DatabaseError('goal history read')))
		);

		expect(thrown.status).toBe(503);
		expect(thrown.body.storage).toBe(true);
		expect(thrown.body.message).toBe(STORAGE_READ_MESSAGE);
	});

	it('says a write failed rather than that a read did', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});

		const thrown = await thrownBy(() =>
			fromStorage(() => Promise.reject(new DatabaseError('goal archive')), STORAGE_WRITE_MESSAGE)
		);

		expect(thrown.body.message).toBe(STORAGE_WRITE_MESSAGE);
	});

	// A Postgres message names columns and constraints. It belongs in the log,
	// which is where the operation is recorded, and nowhere near a response.
	it('does not put the database’s own words in front of the runner', async () => {
		const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

		const thrown = await thrownBy(() =>
			fromStorage(() =>
				Promise.reject(
					new DatabaseError('goal archive', 'null value in column "user_id" violates not-null')
				)
			)
		);

		expect(thrown.body.message).not.toContain('user_id');
		expect(logged).toHaveBeenCalledWith(expect.stringContaining('user_id'));
	});

	// A bug in this app is not a storage failure and must not be dressed as
	// one: it goes up untouched, for `handleError` to log.
	it('lets anything else through unchanged', async () => {
		const bug = new TypeError('x is not a function');
		await expect(fromStorage(() => Promise.reject(bug))).rejects.toBe(bug);
	});
});
