import { describe, it, expect } from 'vitest';
import type { Goal, UserStats } from '$lib/server/trenara/types';
import { projectSnapshot, type SharedSnapshot } from './snapshot';

/**
 * Everything Trenara sends about a goal and its stats — deliberately more
 * than `projectSnapshot` is allowed to publish. `intermediate_goals`,
 * `can_be_edited`, `overrule_time`, `flat_stats` and the other four distances
 * are the fields this test exists to prove never ride along.
 */
const fullGoal = {
	id: 7,
	name: 'Berlin Marathon',
	description: 'A secret note the runner wrote to themselves',
	start_date: '2026-01-06',
	end_date: '2026-09-27',
	can_be_edited: false,
	created_at: 1700000000,
	distance: '42.195 km',
	distance_unit: 'km',
	distance_unit_text: 'Kilometres',
	distance_value: 42.195,
	edit_warning: null,
	intermediate_goals: [{ id: 1, name: 'Half', date: '2026-06-01' }],
	number_of_trainings: 120,
	overrule_time: false,
	pace: '5:00 min/km',
	pace_unit: 'min/km',
	pace_value: 300,
	time: '3:30:00',
	time_in_sec: 12600,
	time_unit: 'hh:mm:ss',
	time_value: 12600,
	time_type_selected: 'time',
	training_condition: {},
	training_scheme_type: 'ultimate',
	week: [{ day: 0, excel_id: 1, training_id: 1001 }]
} as unknown as Goal;

const fullStats = {
	best_times: {
		distance_unit: 'km',
		pace_unit: 'min/km',
		pace_for_5: '4:30 min/km',
		time_for_5: '00:22:30',
		pace_for_10: '4:40 min/km',
		time_for_10: '00:46:40',
		pace_for_half_marathon: '4:55 min/km',
		time_for_half_marathon: '01:44:00',
		pace_for_marathon: '5:06 min/km',
		time_for_marathon: '03:35:00',
		pace_for_goal: '5:06 min/km',
		time_for_goal: '03:35:00'
	},
	flat_stats: [{ title: 'This week', icon: 'run', data: [{ title: 'km', value: '42' }] }],
	graph_stats: {
		weeks: { data: [], done: '0 km', done_value: 0, done_unit: 'km', done_unit_text: 'km' },
		goal: {
			data: [
				{
					week: 1,
					order: 1,
					month: 'January',
					year: 2026,
					is_current_week: false,
					done: '40 km',
					done_value: 40,
					done_unit: 'km',
					done_unit_text: 'km',
					todo: '45 km',
					todo_value: 45,
					todo_unit: 'km',
					todo_unit_text: 'km'
				}
			],
			done: '40 km',
			done_value: 40,
			done_unit: 'km',
			done_unit_text: 'km',
			todo: '45 km',
			todo_value: 45,
			todo_unit: 'km',
			todo_unit_text: 'km'
		}
	}
} as unknown as UserStats;

const GOAL_KEYS = [
	'name',
	'start_date',
	'end_date',
	'distance',
	'distance_unit',
	'distance_value',
	'time',
	'time_in_sec',
	'pace'
].sort();

const BEST_TIMES_KEYS = ['time_for_goal', 'pace_for_goal'].sort();

describe('projectSnapshot', () => {
	it('carries exactly the goal card reads, and nothing else', () => {
		const snapshot = projectSnapshot(fullGoal, fullStats) as SharedSnapshot;

		expect(Object.keys(snapshot).sort()).toEqual(['best_times', 'goal', 'plan_weeks', 'v']);
		expect(Object.keys(snapshot.goal).sort()).toEqual(GOAL_KEYS);
		expect(Object.keys(snapshot.best_times).sort()).toEqual(BEST_TIMES_KEYS);
	});

	it('never publishes the goal description', () => {
		const snapshot = projectSnapshot(fullGoal, fullStats) as SharedSnapshot;
		expect(JSON.stringify(snapshot)).not.toContain('secret note');
	});

	it('never publishes account fields, other distances, or the raw weekly plan', () => {
		const snapshot = projectSnapshot(fullGoal, fullStats) as SharedSnapshot;
		const json = JSON.stringify(snapshot);
		expect(json).not.toMatch(/intermediate_goals|flat_stats|time_for_10|time_for_5|marathon/);
	});

	it('carries the plan weeks the forecast is priced from', () => {
		const snapshot = projectSnapshot(fullGoal, fullStats) as SharedSnapshot;
		expect(snapshot.plan_weeks).toEqual(fullStats.graph_stats.goal);
	});

	it('is versioned', () => {
		const snapshot = projectSnapshot(fullGoal, fullStats) as SharedSnapshot;
		expect(snapshot.v).toBe(1);
	});

	it('is null when the goal has no name', () => {
		expect(projectSnapshot({ ...fullGoal, name: '' }, fullStats)).toBeNull();
	});

	it('is null when the goal has no dates', () => {
		expect(projectSnapshot({ ...fullGoal, start_date: '' }, fullStats)).toBeNull();
		expect(projectSnapshot({ ...fullGoal, end_date: '' }, fullStats)).toBeNull();
	});

	it('is null when there is no current prediction', () => {
		const noTime = {
			...fullStats,
			best_times: { ...fullStats.best_times, time_for_goal: '' }
		} as unknown as UserStats;
		expect(projectSnapshot(fullGoal, noTime)).toBeNull();

		const noPace = {
			...fullStats,
			best_times: { ...fullStats.best_times, pace_for_goal: '' }
		} as unknown as UserStats;
		expect(projectSnapshot(fullGoal, noPace)).toBeNull();
	});

	it('is null when there are no plan weeks to forecast against', () => {
		const noPlan = { ...fullStats, graph_stats: { weeks: fullStats.graph_stats.weeks } };
		expect(projectSnapshot(fullGoal, noPlan as unknown as UserStats)).toBeNull();
	});
});
