import { describe, it, expect, vi, afterEach } from 'vitest';
import { loadOnce, whenIdle } from './load-once';

describe('loadOnce', () => {
	it('starts the load once and hands every caller the same promise', async () => {
		const load = vi.fn().mockResolvedValue('module');
		const get = loadOnce(load);

		const first = get();
		const second = get();

		expect(first).toBe(second);
		await expect(first).resolves.toBe('module');
		await get();
		expect(load).toHaveBeenCalledTimes(1);
	});

	it('forgets a failure, so the next call tries again', async () => {
		const load = vi
			.fn()
			.mockRejectedValueOnce(new Error('offline'))
			.mockResolvedValueOnce('module');
		const get = loadOnce(load);

		await expect(get()).rejects.toThrow('offline');
		await expect(get()).resolves.toBe('module');
		expect(load).toHaveBeenCalledTimes(2);
	});
});

describe('whenIdle', () => {
	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	it('waits for idle time where the browser offers it, and can be cancelled', () => {
		const request = vi.fn().mockReturnValue(7);
		const cancel = vi.fn();
		vi.stubGlobal('requestIdleCallback', request);
		vi.stubGlobal('cancelIdleCallback', cancel);
		const task = vi.fn();

		const stop = whenIdle(task);
		expect(request).toHaveBeenCalledWith(task, { timeout: 3000 });
		expect(task).not.toHaveBeenCalled();

		stop();
		expect(cancel).toHaveBeenCalledWith(7);
	});

	it('falls back to a timeout without requestIdleCallback', () => {
		vi.useFakeTimers();
		vi.stubGlobal('requestIdleCallback', undefined);
		const task = vi.fn();

		whenIdle(task);
		vi.advanceTimersByTime(999);
		expect(task).not.toHaveBeenCalled();
		vi.advanceTimersByTime(1);
		expect(task).toHaveBeenCalledTimes(1);

		const cancelled = vi.fn();
		const stop = whenIdle(cancelled);
		stop();
		vi.advanceTimersByTime(2000);
		expect(cancelled).not.toHaveBeenCalled();
	});
});
