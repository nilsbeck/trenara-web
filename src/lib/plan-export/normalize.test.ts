import { describe, it, expect } from 'vitest';
import {
	buildExport,
	flattenBlocks,
	normalizeEntry,
	normalizeSession,
	normalizeStrength,
	toKm,
	toPacePerKm,
	withinRange
} from './normalize';
import { makeEntry, makeSchedule, makeTraining } from '../../test-utils/plan-fixtures';
import type { StrengthTraining } from '../server/trenara/types';

describe('toKm', () => {
	it('passes kilometres through', () => {
		expect(toKm(12.09, 'km')).toBe(12.09);
	});

	it('converts metres, which is how interval blocks arrive', () => {
		expect(toKm(800, 'm')).toBeCloseTo(0.8, 10);
	});

	it('converts miles', () => {
		expect(toKm(1, 'mi')).toBeCloseTo(1.609344, 6);
	});

	it('assumes km when the unit is missing', () => {
		expect(toKm(5, null)).toBe(5);
		expect(toKm(5, undefined)).toBe(5);
	});

	it('answers null on an unknown unit rather than passing the number through', () => {
		expect(toKm(800, 'furlong')).toBeNull();
	});

	it('answers null on an absent value', () => {
		expect(toKm(null, 'km')).toBeNull();
		expect(toKm(undefined, 'km')).toBeNull();
		expect(toKm(Number.NaN, 'km')).toBeNull();
	});
});

describe('toPacePerKm', () => {
	it('reads the denominator of a min/km pace unit', () => {
		expect(toPacePerKm(346, 'min/km')).toBe(346);
	});

	it('converts a per-mile pace to per-km', () => {
		expect(toPacePerKm(480, 'min/mi')).toBeCloseTo(480 / 1.609344, 6);
	});

	it('accepts a bare unit as well as a min/ prefixed one', () => {
		expect(toPacePerKm(346, 'km')).toBe(346);
	});

	it('answers null on a zero or absent pace, which is not a pace', () => {
		expect(toPacePerKm(0, 'min/km')).toBeNull();
		expect(toPacePerKm(null, 'min/km')).toBeNull();
	});

	it('answers null on an unreadable unit rather than guessing', () => {
		expect(toPacePerKm(346, 'min/fathom')).toBeNull();
	});
});

describe('flattenBlocks', () => {
	const blocks = flattenBlocks(makeTraining().training.blocks);

	it('gives every block a dotted path that is unique within the session', () => {
		expect(blocks.map((block) => block.path)).toEqual(['1', '2', '2.1', '2.2']);
		expect(new Set(blocks.map((block) => block.path)).size).toBe(blocks.length);
	});

	it('keeps the group block, so a repeat count is visible in a diff', () => {
		const group = blocks.find((block) => block.path === '2');
		expect(group?.repeat).toBe(3);
	});

	it('carries the enclosing repeats down to the children', () => {
		expect(blocks.find((block) => block.path === '2.1')?.repeat_context).toBe(3);
		expect(blocks.find((block) => block.path === '1')?.repeat_context).toBe(1);
	});

	it('normalises a metre block to kilometres', () => {
		expect(blocks.find((block) => block.path === '2.1')?.distance_km).toBe(0.8);
	});

	it('keeps the slow end of a pace range as the larger number', () => {
		const interval = blocks.find((block) => block.path === '2.1');
		expect(interval?.pace_range_slow_sec_per_km).toBe(259);
		expect(interval?.pace_range_fast_sec_per_km).toBe(241);
	});

	it('leaves a rest block without a distance rather than calling it zero', () => {
		const rest = blocks.find((block) => block.path === '2.2');
		expect(rest?.distance_km).toBeNull();
		expect(rest?.time_sec).toBe(120);
	});

	it('answers an empty list for a session with no blocks', () => {
		expect(flattenBlocks(undefined)).toEqual([]);
		expect(flattenBlocks([])).toEqual([]);
	});
});

describe('normalizeSession', () => {
	it('prefers the full-precision total over the rounded one', () => {
		expect(normalizeSession(makeTraining(), 12).total_distance_km).toBe(12.0934);
	});

	it('falls back to the rounded total when precision is absent', () => {
		const training = makeTraining();
		const withoutPrecision = {
			...training,
			training: { ...training.training, total_distance_in_km: undefined }
		};
		expect(normalizeSession(withoutPrecision, 12).total_distance_km).toBe(12.09);
	});

	it('reads the applied intensity from the selected step, not the condition', () => {
		// The training_condition is null here, as it is on any session whose
		// terrain has never been set — the step is the only reliable source.
		const session = normalizeSession(makeTraining(), 12);
		expect(session.adjustments.intensity_pct).toBe(98);
		expect(session.adjustments.intensity_step_text).toBe('A bit slower');
	});

	it('carries the distance step as its own value and text, never as a percentage', () => {
		const session = normalizeSession(makeTraining(), 12);
		expect(session.adjustments.distance_step_value).toBe(0);
		expect(session.adjustments.distance_step_text).toBe('As planned');
	});

	it('leaves the adjustment null when no step is selected', () => {
		const training = makeTraining({ change_intensity_package: null });
		expect(normalizeSession(training, 12).adjustments.intensity_pct).toBeNull();
	});

	it('derives the average pace from the totals', () => {
		expect(normalizeSession(makeTraining(), 12).avg_pace_sec_per_km).toBe(
			Math.round((4068 / 12.0934) * 10) / 10
		);
	});

	it('has no average pace on a cross-trained session, which has no distance', () => {
		const training = makeTraining({ cross_type: 'road_bike' });
		const cycling = {
			...training,
			training: {
				...training.training,
				total_distance_in_km: 0,
				total_distance_value: null,
				total_distance_unit: null
			}
		};
		const session = normalizeSession(cycling, 12);
		expect(session.avg_pace_sec_per_km).toBeNull();
		expect(session.cross_type).toBe('road_bike');
	});

	it('reads the date off day_long', () => {
		expect(normalizeSession(makeTraining(), 12).date).toBe('2026-09-02');
	});

	it('survives a day_long that is a full timestamp rather than a bare date', () => {
		const training = makeTraining({ day_long: '2026-09-02T00:00:00+02:00' });
		expect(normalizeSession(training, 12).date).toBe('2026-09-02');
	});

	it('leaves the date null on an unreadable day rather than throwing', () => {
		const training = makeTraining({ day_long: '' });
		expect(normalizeSession(training, 12).date).toBeNull();
	});

	it('distinguishes a capability the payload omits from one it sends false', () => {
		const session = normalizeSession(makeTraining({ can_cross_train: undefined }), 12);
		expect(session.capabilities.can_cross_train).toBeNull();
		expect(session.capabilities.can_change_pacing_plan).toBe(false);
	});
});

describe('normalizeEntry', () => {
	it('normalises distance, time and pace', () => {
		const entry = normalizeEntry(makeEntry());
		expect(entry.distance_km).toBe(12.09);
		expect(entry.time_sec).toBe(4068);
		expect(entry.pace_sec_per_km).toBe(336);
	});

	it('names the source that logged it', () => {
		expect(normalizeEntry(makeEntry()).source).toBe('garmin');
		expect(normalizeEntry(makeEntry({ garmin: false, strava: true })).source).toBe('strava');
		expect(normalizeEntry(makeEntry({ garmin: false, strava: false, trenara: false })).source).toBe(
			'unknown'
		);
	});

	it('reads the date off the start time', () => {
		expect(normalizeEntry(makeEntry()).date).toBe('2026-09-02');
	});

	it('keeps an unrated entry null rather than zero', () => {
		expect(normalizeEntry(makeEntry({ rpe: null })).rpe).toBeNull();
	});
});

describe('normalizeStrength', () => {
	const strength = {
		id: 77,
		strength_id: null,
		type_id: 3,
		title: 'Core stability',
		training_type: 'strength',
		description: 'Twenty minutes.',
		icon_url: '',
		day: '2026-09-03',
		time: '20:00',
		rest_between_sets: 30,
		rest_between_exercises: 60,
		exercises: [
			{ id: 1, name: 'Plank' },
			{ id: 2, name: 'Bridge' }
		],
		accessories: []
	} as unknown as StrengthTraining;

	it('names the exercises and counts them', () => {
		const normalized = normalizeStrength(strength);
		expect(normalized.exercises).toEqual(['Plank', 'Bridge']);
		expect(normalized.exercise_count).toBe(2);
		expect(normalized.date).toBe('2026-09-03');
	});

	it('handles a session with no exercises', () => {
		const empty = { ...strength, exercises: undefined } as unknown as StrengthTraining;
		expect(normalizeStrength(empty).exercise_count).toBe(0);
	});
});

describe('withinRange', () => {
	it('includes both ends', () => {
		expect(withinRange('2026-09-02', '2026-09-02', '2026-12-06')).toBe(true);
		expect(withinRange('2026-12-06', '2026-09-02', '2026-12-06')).toBe(true);
	});

	it('excludes either side', () => {
		expect(withinRange('2026-09-01', '2026-09-02', '2026-12-06')).toBe(false);
		expect(withinRange('2026-12-07', '2026-09-02', '2026-12-06')).toBe(false);
	});

	it('excludes a row whose date did not parse', () => {
		expect(withinRange(null, '2026-09-02', '2026-12-06')).toBe(false);
	});
});

describe('buildExport', () => {
	const options = {
		from: '2026-09-02',
		to: '2026-12-06',
		goal: null,
		timezone: 'Europe/Berlin',
		source: 'test',
		includeRaw: false,
		now: new Date(2026, 8, 2, 9, 0)
	};

	it('drops the rows the Monday overhang dragged in', () => {
		// The week starts on the 31st, two days before the range does.
		const schedule = makeSchedule({
			trainings: [
				makeTraining({ id: 1, day_long: '2026-08-31' }),
				makeTraining({ id: 2, day_long: '2026-09-02' })
			]
		});
		const plan = buildExport([schedule], options);
		expect(plan.sessions.map((session) => session.id)).toEqual([2]);
	});

	it('drops rows past the end of the range too', () => {
		const schedule = makeSchedule({
			trainings: [
				makeTraining({ id: 3, day_long: '2026-12-06' }),
				makeTraining({ id: 4, day_long: '2026-12-07' })
			],
			entries: []
		});
		expect(buildExport([schedule], options).sessions.map((s) => s.id)).toEqual([3]);
	});

	it('sorts sessions and entries by date across weeks', () => {
		const later = makeSchedule({
			training_week: 13,
			trainings: [makeTraining({ id: 9, day_long: '2026-09-09' })],
			entries: []
		});
		const earlier = makeSchedule({
			trainings: [makeTraining({ id: 8, day_long: '2026-09-02' })],
			entries: []
		});
		const plan = buildExport([later, earlier], options);
		expect(plan.sessions.map((session) => session.date)).toEqual(['2026-09-02', '2026-09-09']);
	});

	it('summarises planned and completed volume per week', () => {
		const plan = buildExport([makeSchedule()], options);
		expect(plan.weeks).toHaveLength(1);
		expect(plan.weeks[0].training_week).toBe(12);
		expect(plan.weeks[0].session_count).toBe(1);
		expect(plan.weeks[0].planned_distance_km).toBeCloseTo(12.093, 3);
		expect(plan.weeks[0].completed_distance_km).toBeCloseTo(12.09, 3);
		expect(plan.weeks[0].week_start).toBe('2026-08-31');
	});

	it('omits a week whose every row fell outside the range', () => {
		const outside = makeSchedule({
			trainings: [makeTraining({ day_long: '2026-01-05' })],
			entries: [makeEntry({ start_time: '2026-01-05T06:00:00+01:00' })]
		});
		expect(buildExport([outside], options).weeks).toEqual([]);
	});

	it('omits the raw payloads when asked to', () => {
		expect(buildExport([makeSchedule()], options).raw).toBeUndefined();
	});

	it('carries the raw payloads verbatim when asked to', () => {
		const schedule = makeSchedule();
		const plan = buildExport([schedule], { ...options, includeRaw: true });
		expect(plan.raw).toEqual([schedule]);
	});

	it('records the range and the timezone it was resolved in', () => {
		const plan = buildExport([makeSchedule()], options);
		expect(plan.meta.from).toBe('2026-09-02');
		expect(plan.meta.to).toBe('2026-12-06');
		expect(plan.meta.timezone).toBe('Europe/Berlin');
		expect(plan.meta.weeks_requested).toBe(1);
	});

	it('summarises the goal, including how far off it is', () => {
		const goal = {
			id: 5,
			name: 'Berlin Marathon',
			start_date: '2026-06-01',
			end_date: '2026-09-27',
			distance_value: 42.195,
			distance_unit: 'km'
		} as Parameters<typeof buildExport>[1]['goal'];
		const plan = buildExport([makeSchedule()], { ...options, goal });
		expect(plan.goal?.distance_km).toBe(42.195);
		expect(plan.goal?.days_to_goal).toBe(25);
	});

	it('reports no goal rather than failing when the goal call did not answer', () => {
		expect(buildExport([makeSchedule()], options).goal).toBeNull();
	});
});
