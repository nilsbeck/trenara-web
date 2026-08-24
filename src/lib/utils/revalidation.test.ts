import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRevalidationTrigger, localDayKey } from './revalidation';

function setVisibility(state: 'visible' | 'hidden') {
	Object.defineProperty(document, 'visibilityState', {
		configurable: true,
		get: () => state
	});
}

describe('localDayKey', () => {
	it('is the local calendar day', () => {
		expect(localDayKey(new Date(2025, 2, 5, 23, 59))).toBe('2025-3-5');
	});

	it('differs either side of local midnight', () => {
		expect(localDayKey(new Date(2025, 2, 5, 23, 59))).not.toBe(
			localDayKey(new Date(2025, 2, 6, 0, 1))
		);
	});
});

describe('createRevalidationTrigger', () => {
	let clock = 0;
	const now = () => clock;

	beforeEach(() => {
		clock = 0;
		vi.useFakeTimers();
		setVisibility('visible');
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('fires when the tab becomes visible again', () => {
		const onTrigger = vi.fn();
		const trigger = createRevalidationTrigger({ onTrigger, now, minGapMs: 1000 });

		clock = 5000;
		document.dispatchEvent(new Event('visibilitychange'));

		expect(onTrigger).toHaveBeenCalledWith('visible');
		trigger.stop();
	});

	it('ignores a visibilitychange that hid the tab', () => {
		const onTrigger = vi.fn();
		const trigger = createRevalidationTrigger({ onTrigger, now, minGapMs: 1000 });

		clock = 5000;
		setVisibility('hidden');
		document.dispatchEvent(new Event('visibilitychange'));

		expect(onTrigger).not.toHaveBeenCalled();
		trigger.stop();
	});

	it('fires on window focus', () => {
		const onTrigger = vi.fn();
		const trigger = createRevalidationTrigger({ onTrigger, now, minGapMs: 1000 });

		clock = 5000;
		window.dispatchEvent(new Event('focus'));

		expect(onTrigger).toHaveBeenCalledWith('focus');
		trigger.stop();
	});

	it('holds off a second trigger inside the minimum gap', () => {
		const onTrigger = vi.fn();
		const trigger = createRevalidationTrigger({ onTrigger, now, minGapMs: 60_000 });

		clock = 61_000;
		window.dispatchEvent(new Event('focus'));
		clock = 62_000;
		window.dispatchEvent(new Event('focus'));

		expect(onTrigger).toHaveBeenCalledTimes(1);
		trigger.stop();
	});

	it('ignores the minimum gap when the network comes back', () => {
		const onTrigger = vi.fn();
		const trigger = createRevalidationTrigger({ onTrigger, now, minGapMs: 60_000 });

		clock = 61_000;
		window.dispatchEvent(new Event('focus'));
		window.dispatchEvent(new Event('online'));

		expect(onTrigger).toHaveBeenNthCalledWith(2, 'online');
		trigger.stop();
	});

	it('fires on the interval while the page is visible', () => {
		const onTrigger = vi.fn();
		const trigger = createRevalidationTrigger({
			onTrigger,
			now,
			intervalMs: 1000,
			minGapMs: 0
		});

		clock = 1000;
		vi.advanceTimersByTime(1000);

		expect(onTrigger).toHaveBeenCalledWith('interval');
		trigger.stop();
	});

	it('does not fire on the interval while the page is hidden', () => {
		const onTrigger = vi.fn();
		const trigger = createRevalidationTrigger({
			onTrigger,
			now,
			intervalMs: 1000,
			minGapMs: 0
		});

		setVisibility('hidden');
		vi.advanceTimersByTime(3000);

		expect(onTrigger).not.toHaveBeenCalled();
		trigger.stop();
	});

	it('fires on a day rollover even while hidden, and even inside the gap', () => {
		const onTrigger = vi.fn();
		let day = '2025-3-5';
		const trigger = createRevalidationTrigger({
			onTrigger,
			now,
			dayKey: () => day,
			intervalMs: 1000,
			minGapMs: 60 * 60 * 1000
		});

		setVisibility('hidden');
		day = '2025-3-6';
		vi.advanceTimersByTime(1000);

		expect(onTrigger).toHaveBeenCalledExactlyOnceWith('day-change');
		trigger.stop();
	});

	it('reports a rollover once, not on every check afterwards', () => {
		const onTrigger = vi.fn();
		let day = '2025-3-5';
		const trigger = createRevalidationTrigger({
			onTrigger,
			now,
			dayKey: () => day,
			intervalMs: 1000,
			minGapMs: 60 * 60 * 1000
		});

		day = '2025-3-6';
		vi.advanceTimersByTime(3000);

		expect(onTrigger).toHaveBeenCalledTimes(1);
		trigger.stop();
	});

	it('prefers the day rollover over the weaker reason that noticed it', () => {
		const onTrigger = vi.fn();
		let day = '2025-3-5';
		const trigger = createRevalidationTrigger({ onTrigger, now, dayKey: () => day });

		day = '2025-3-6';
		document.dispatchEvent(new Event('visibilitychange'));

		expect(onTrigger).toHaveBeenCalledExactlyOnceWith('day-change');
		trigger.stop();
	});

	it('stops listening once stopped', () => {
		const onTrigger = vi.fn();
		const trigger = createRevalidationTrigger({ onTrigger, now, intervalMs: 1000, minGapMs: 0 });

		trigger.stop();
		clock = 10_000;
		window.dispatchEvent(new Event('focus'));
		window.dispatchEvent(new Event('online'));
		document.dispatchEvent(new Event('visibilitychange'));
		vi.advanceTimersByTime(5000);

		expect(onTrigger).not.toHaveBeenCalled();
	});
});
