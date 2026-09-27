import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockWaitUntil = vi.fn();
vi.mock('@vercel/functions', () => ({ waitUntil: (p: Promise<unknown>) => mockWaitUntil(p) }));

import { afterResponse } from './after-response';

describe('afterResponse', () => {
	beforeEach(() => {
		mockWaitUntil.mockReset();
	});

	it('hands the task to waitUntil so the invocation outlives the response', async () => {
		let settle!: () => void;
		const task = new Promise<void>((resolve) => (settle = resolve));

		afterResponse(task);

		expect(mockWaitUntil).toHaveBeenCalledTimes(1);
		const held = mockWaitUntil.mock.calls[0][0] as Promise<unknown>;
		let done = false;
		void held.then(() => (done = true));
		await Promise.resolve();
		expect(done).toBe(false);

		settle();
		await held;
		expect(done).toBe(true);
	});

	it('logs a rejection instead of leaving it unhandled', async () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});

		afterResponse(Promise.reject(new Error('boom')));

		await expect(mockWaitUntil.mock.calls[0][0]).resolves.toBeUndefined();
		expect(error).toHaveBeenCalledWith(
			'[afterResponse] background task failed:',
			expect.objectContaining({ message: 'boom' })
		);
		error.mockRestore();
	});
});
