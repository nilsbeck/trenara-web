import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
	createRevalidationTrigger,
	localDayKey,
	stalenessReason,
	DEFAULT_MAX_AGE_MS
} from './revalidation';

const HOUR = 60 * 60 * 1000;

function at(year: number, month: number, day: number, hour = 12, minute = 0): number {
	return new Date(year, month - 1, day, hour, minute).getTime();
}

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

describe('stalenessReason', () => {
	it('says nothing when the data is from earlier today', () => {
		expect(stalenessReason(at(2025, 3, 5, 8), at(2025, 3, 5, 11))).toBeNull();
	});

	it('says nothing when there is no data yet', () => {
		expect(stalenessReason(null, at(2025, 3, 5, 11))).toBeNull();
	});

	it('flags data carried over from yesterday', () => {
		expect(stalenessReason(at(2025, 3, 4, 22), at(2025, 3, 5, 7))).toBe('new-day');
	});

	it('flags data from minutes ago that crossed midnight', () => {
		expect(stalenessReason(at(2025, 3, 4, 23, 58), at(2025, 3, 5, 0, 2))).toBe('new-day');
	});

	it('catches a refresh that landed before the overnight rework', () => {
		// Refreshed at 00:01, processing ran at 03:00: same day, so only the age
		// backstop notices.
		expect(stalenessReason(at(2025, 3, 5, 0, 1), at(2025, 3, 5, 8))).toBe('max-age');
	});

	it('leaves a full day of ordinary use alone', () => {
		const morning = at(2025, 3, 5, 8);
		for (let hour = 8; hour < 14; hour++) {
			expect(stalenessReason(morning, at(2025, 3, 5, hour))).toBeNull();
		}
	});

	it('honours a custom max age', () => {
		expect(stalenessReason(at(2025, 3, 5, 8), at(2025, 3, 5, 10), HOUR)).toBe('max-age');
	});

	it('treats exactly the max age as stale', () => {
		const start = at(2025, 3, 5, 1);
		expect(stalenessReason(start, start + DEFAULT_MAX_AGE_MS)).toBe('max-age');
	});
});

describe('createRevalidationTrigger', () => {
	let clock = at(2025, 3, 5, 9);
	const now = () => clock;

	beforeEach(() => {
		clock = at(2025, 3, 5, 9);
		vi.useFakeTimers();
		setVisibility('visible');
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('does not fetch when the data is from earlier today', () => {
		const onTrigger = vi.fn();
		const trigger = createRevalidationTrigger({
			lastUpdatedAt: () => at(2025, 3, 5, 8),
			onTrigger,
			now,
			checkIntervalMs: 1000
		});

		window.dispatchEvent(new Event('focus'));
		document.dispatchEvent(new Event('visibilitychange'));
		vi.advanceTimersByTime(60_000);

		expect(onTrigger).not.toHaveBeenCalled();
		trigger.stop();
	});

	it('fetches once when a tab left open is looked at on a new day', () => {
		let updatedAt = at(2025, 3, 4, 21);
		const onTrigger = vi.fn(() => {
			updatedAt = clock;
		});
		const trigger = createRevalidationTrigger({
			lastUpdatedAt: () => updatedAt,
			onTrigger,
			now,
			checkIntervalMs: 1000
		});

		window.dispatchEvent(new Event('focus'));
		expect(onTrigger).toHaveBeenCalledExactlyOnceWith('new-day');

		// Everything afterwards finds the data current and asks for nothing.
		clock += 60_000;
		document.dispatchEvent(new Event('visibilitychange'));
		vi.advanceTimersByTime(120_000);
		expect(onTrigger).toHaveBeenCalledTimes(1);

		trigger.stop();
	});

	it('checks on the interval without fetching', () => {
		const onCheck = vi.fn();
		const onTrigger = vi.fn();
		const trigger = createRevalidationTrigger({
			lastUpdatedAt: () => at(2025, 3, 5, 8),
			onTrigger,
			onCheck,
			now,
			checkIntervalMs: 1000
		});

		vi.advanceTimersByTime(3000);

		// Midnight still gets noticed; the server hears nothing about it.
		expect(onCheck).toHaveBeenCalledTimes(3);
		expect(onTrigger).not.toHaveBeenCalled();
		trigger.stop();
	});

	it('leaves a hidden tab alone', () => {
		const onCheck = vi.fn();
		const onTrigger = vi.fn();
		const trigger = createRevalidationTrigger({
			lastUpdatedAt: () => at(2025, 3, 4, 21),
			onTrigger,
			onCheck,
			now,
			checkIntervalMs: 1000
		});

		setVisibility('hidden');
		vi.advanceTimersByTime(5000);
		document.dispatchEvent(new Event('visibilitychange'));

		expect(onCheck).not.toHaveBeenCalled();
		expect(onTrigger).not.toHaveBeenCalled();
		trigger.stop();
	});

	it('fetches the moment a hidden tab is looked at again on a new day', () => {
		const onTrigger = vi.fn();
		const trigger = createRevalidationTrigger({
			lastUpdatedAt: () => at(2025, 3, 4, 21),
			onTrigger,
			now,
			checkIntervalMs: 1000
		});

		setVisibility('hidden');
		vi.advanceTimersByTime(5000);
		setVisibility('visible');
		document.dispatchEvent(new Event('visibilitychange'));

		expect(onTrigger).toHaveBeenCalledExactlyOnceWith('new-day');
		trigger.stop();
	});

	it('does not retry a failed refresh more than once a minute', () => {
		const onTrigger = vi.fn(); // never updates lastUpdatedAt: the refresh failed
		const trigger = createRevalidationTrigger({
			lastUpdatedAt: () => at(2025, 3, 4, 21),
			onTrigger,
			now,
			minGapMs: 60_000,
			checkIntervalMs: 1000
		});

		window.dispatchEvent(new Event('focus'));
		clock += 30_000;
		window.dispatchEvent(new Event('focus'));

		expect(onTrigger).toHaveBeenCalledTimes(1);

		clock += 31_000;
		window.dispatchEvent(new Event('focus'));
		expect(onTrigger).toHaveBeenCalledTimes(2);

		trigger.stop();
	});

	it('stops listening once stopped', () => {
		const onCheck = vi.fn();
		const onTrigger = vi.fn();
		const trigger = createRevalidationTrigger({
			lastUpdatedAt: () => at(2025, 3, 4, 21),
			onTrigger,
			onCheck,
			now,
			checkIntervalMs: 1000
		});

		trigger.stop();
		window.dispatchEvent(new Event('focus'));
		document.dispatchEvent(new Event('visibilitychange'));
		vi.advanceTimersByTime(5000);

		expect(onCheck).not.toHaveBeenCalled();
		expect(onTrigger).not.toHaveBeenCalled();
	});
});
