import { describe, it, expect } from 'vitest';
import { wasReloaded } from './offline-reload';

function timing(type: string | null) {
	return {
		getEntriesByType: (kind: string) =>
			kind === 'navigation' && type ? [{ type } as unknown as PerformanceEntry] : []
	};
}

describe('wasReloaded', () => {
	it('is true for a reload', () => {
		expect(wasReloaded(timing('reload'))).toBe(true);
	});

	// The worker's redirect back to the offline page arrives as `navigate`:
	// were it read as a reload, the page would send it on again, for ever.
	it('is false for a page that was navigated to', () => {
		expect(wasReloaded(timing('navigate'))).toBe(false);
		expect(wasReloaded(timing('back_forward'))).toBe(false);
	});

	it('is false where Navigation Timing has nothing to say', () => {
		expect(wasReloaded(timing(null))).toBe(false);
		expect(wasReloaded(undefined)).toBe(false);
		expect(
			wasReloaded({
				getEntriesByType: () => {
					throw new Error('unsupported');
				}
			})
		).toBe(false);
	});
});
