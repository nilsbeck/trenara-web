import { describe, it, expect } from 'vitest';
import type { AppConfig } from '$lib/server/trenara/types';
import { pauseReasons, pauseReasonLabel, FALLBACK_REASONS } from './pause';

/**
 * The reasons the pause dialog offers.
 *
 * The rule under test throughout: the served list wins, and the constant is
 * only what stands in when `/api/config/app` could not be read. A reason added
 * upstream has to reach the picker without a deploy here, which is the whole
 * reason this reads the config at all.
 */

function config(pause_types: AppConfig['pause_types']): AppConfig {
	return { pause_types } as unknown as AppConfig;
}

describe('pauseReasons', () => {
	it('falls back to the captured list when there is no config', () => {
		expect(pauseReasons(null).map((r) => r.type)).toEqual(FALLBACK_REASONS.map((r) => r.type));
		expect(pauseReasons(undefined)).toHaveLength(FALLBACK_REASONS.length);
	});

	it('falls back when the config carries an empty list', () => {
		expect(pauseReasons(config([]))).toHaveLength(FALLBACK_REASONS.length);
	});

	it('prefers the served list, including a reason the constant never had', () => {
		const reasons = pauseReasons(
			config([
				{ order: 1, type: 'illness', title: 'Ziekte', ask_extra_input: false },
				{ order: 2, type: 'sabbatical', title: 'Sabbatical', ask_extra_input: true }
			])
		);

		expect(reasons.map((r) => r.type)).toEqual(['illness', 'sabbatical']);
		// Labels are localised upstream: the served title wins over ours.
		expect(reasons[0].label).toBe('Ziekte');
	});

	it('sorts by `order`, which is what the field is for', () => {
		const reasons = pauseReasons(
			config([
				{ order: 5, type: 'other', title: 'Other', ask_extra_input: true },
				{ order: 1, type: 'illness', title: 'Illness', ask_extra_input: false },
				{ order: 3, type: 'holiday', title: 'Holiday', ask_extra_input: false }
			])
		);

		expect(reasons.map((r) => r.type)).toEqual(['illness', 'holiday', 'other']);
	});

	it('carries ask_extra_input through as the flag the dialog reads', () => {
		const reasons = pauseReasons(
			config([
				{ order: 1, type: 'illness', title: 'Illness', ask_extra_input: false },
				{ order: 2, type: 'other', title: 'Other', ask_extra_input: true }
			])
		);

		expect(reasons.find((r) => r.type === 'illness')?.askExtraInput).toBe(false);
		expect(reasons.find((r) => r.type === 'other')?.askExtraInput).toBe(true);
	});

	// A radio with no value posts nothing and is refused; not offering it is
	// better than offering something that cannot work.
	it('drops an entry with no wire value', () => {
		const reasons = pauseReasons(
			config([
				{ order: 1, type: '', title: 'Broken', ask_extra_input: false },
				{ order: 2, type: 'holiday', title: 'Holiday', ask_extra_input: false }
			])
		);

		expect(reasons.map((r) => r.type)).toEqual(['holiday']);
	});

	it('falls back when nothing in the served list is usable', () => {
		const reasons = pauseReasons(
			config([{ order: 1, type: '', title: 'Broken', ask_extra_input: false }])
		);

		expect(reasons).toHaveLength(FALLBACK_REASONS.length);
	});

	it('labels an entry with no title by its wire value rather than blank', () => {
		const reasons = pauseReasons(
			config([{ order: 1, type: 'holiday', title: '', ask_extra_input: false }])
		);

		expect(reasons[0].label).toBe('holiday');
	});

	it('does not mutate the served array', () => {
		const served: AppConfig['pause_types'] = [
			{ order: 2, type: 'holiday', title: 'Holiday', ask_extra_input: false },
			{ order: 1, type: 'illness', title: 'Illness', ask_extra_input: false }
		];
		pauseReasons(config(served));

		expect(served.map((r) => r.type)).toEqual(['holiday', 'illness']);
	});
});

describe('pauseReasonLabel', () => {
	it('is null when nothing is paused', () => {
		expect(pauseReasonLabel(null)).toBeNull();
		expect(pauseReasonLabel(undefined)).toBeNull();
	});

	it('reads a cause through the served labels', () => {
		const label = pauseReasonLabel(
			'holiday',
			config([{ order: 1, type: 'holiday', title: 'Vakantie', ask_extra_input: false }])
		);

		expect(label).toBe('Vakantie');
	});

	it('falls back to the captured labels with no config', () => {
		expect(pauseReasonLabel('motivation')).toBe('Motivation');
	});

	// A pause set in the mobile app can carry a reason this config never listed.
	it('humanises a cause no list knows about', () => {
		expect(pauseReasonLabel('post_race')).toBe('Post race');
	});
});
