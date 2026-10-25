import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { NavigationEvent } from '@sveltejs/kit';
import { handleError } from './hooks.client';

const event = {
	url: new URL('https://example.test/dashboard'),
	params: {},
	route: { id: '/(app)/dashboard' }
} as NavigationEvent;

beforeEach(() => {
	vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('the client error hook', () => {
	// The failure this exists for: a page that threw after hydration showed
	// "[object Object]", and once that was read properly, SvelteKit's default
	// "Internal Error" — neither of which says what broke.
	it('passes on what an unexpected throw actually said', async () => {
		const result = await handleError({
			kind: 'unknown',
			error: new TypeError("Cannot read properties of undefined (reading 'split')"),
			event
		});

		expect(result).toEqual({ message: "Cannot read properties of undefined (reading 'split')" });
	});

	it('describes a thrown value that is not an Error', async () => {
		expect(await handleError({ kind: 'unknown', error: 'odd', event })).toEqual({
			message: 'odd'
		});
	});

	it('logs the throw with the route it came from', async () => {
		const error = new Error('boom');
		await handleError({ kind: 'unknown', error, event });

		expect(console.error).toHaveBeenCalledWith('[/(app)/dashboard] unexpected error:', error);
	});

	// An `error(404, …)` or a framework 404 already says what the runner
	// should read; overriding it would turn "Not Found" into a stack fragment.
	it('leaves an error that was raised on purpose alone', async () => {
		expect(
			await handleError({ kind: 'app', error: { message: 'Nothing here', status: 404 }, event })
		).toBeUndefined();
		expect(console.error).not.toHaveBeenCalled();
	});
});
