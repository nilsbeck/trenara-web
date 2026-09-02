import { describe, it, expect } from 'vitest';
import { sharedSnapshotSchema } from './share';
import { projectSnapshot } from '$lib/server/share/snapshot';
import type { Goal, UserStats } from '$lib/server/trenara/types';

const goal = {
	id: 7,
	name: 'Berlin Marathon',
	start_date: '2026-01-06',
	end_date: '2026-09-27',
	distance: '42.195 km',
	distance_unit: 'km',
	distance_value: 42.195,
	time: '3:30:00',
	time_in_sec: 12600,
	pace: '5:00 min/km'
} as unknown as Goal;

const stats = {
	best_times: { time_for_goal: '3:35:00', pace_for_goal: '5:06 min/km' },
	graph_stats: {
		goal: {
			data: [
				{
					week: 1,
					order: 1,
					month: 'January',
					year: 2026,
					is_current_week: true,
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

describe('sharedSnapshotSchema', () => {
	it('parses exactly what projectSnapshot produces', () => {
		const snapshot = projectSnapshot(goal, stats);
		expect(sharedSnapshotSchema.safeParse(snapshot).success).toBe(true);
	});

	it('parses a row with an empty plan-weeks series', () => {
		const empty = projectSnapshot(goal, {
			...stats,
			graph_stats: {
				goal: {
					data: [],
					done: '0 km',
					done_value: 0,
					done_unit: 'km',
					done_unit_text: 'km',
					todo: '0 km',
					todo_value: 0,
					todo_unit: 'km',
					todo_unit_text: 'km'
				}
			}
		} as unknown as UserStats);
		expect(sharedSnapshotSchema.safeParse(empty).success).toBe(true);
	});

	// A row written by a shape this schema does not carry an arm for — a
	// deploy ahead of this one, or a shape from before this table existed.
	// Rejecting it is what turns into the public route's "not updated yet"
	// state rather than a crash.
	it('rejects a version this schema carries no arm for', () => {
		const snapshot = projectSnapshot(goal, stats);
		expect(sharedSnapshotSchema.safeParse({ ...snapshot, v: 2 }).success).toBe(false);
	});

	it('rejects a truncated blob', () => {
		expect(sharedSnapshotSchema.safeParse({ v: 1 }).success).toBe(false);
		expect(sharedSnapshotSchema.safeParse({}).success).toBe(false);
		expect(sharedSnapshotSchema.safeParse(null).success).toBe(false);
	});

	it('rejects a goal block missing a required field', () => {
		const snapshot = projectSnapshot(goal, stats);
		const broken = { ...snapshot, goal: { ...snapshot!.goal, name: undefined } };
		expect(sharedSnapshotSchema.safeParse(broken).success).toBe(false);
	});
});
