import { describe, it, expect } from 'vitest';
import {
	hasWeekVolume,
	readWeekVolume,
	shortfallKm,
	volumeBar,
	VOLUME_HEADROOM,
	type WeekVolume
} from './week-volume';
import type { UserStats } from '$lib/server/trenara/types';

type WeekSeries = UserStats['graph_stats']['weeks'];

// Monday 2026-08-24 .. Sunday 2026-08-30.
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function dayRow(order: number, todo: number | null, done: number | null, today = false) {
	const date = `2026-08-${24 + order}`;
	return {
		order,
		day: WEEKDAYS[order],
		date,
		is_today: today,
		done: done === null ? null : `${done}km`,
		done_value: done,
		done_unit: 'km',
		done_unit_text: 'km',
		todo: todo === null ? null : `${todo}km`,
		todo_value: todo,
		todo_unit: 'km',
		todo_unit_text: 'km'
	};
}

function series(totals: { done: number; todo: number }, data: ReturnType<typeof dayRow>[] = []) {
	return {
		data,
		done: `${totals.done}km`,
		done_value: totals.done,
		done_unit: 'km',
		done_unit_text: 'km',
		todo: `${totals.todo}km`,
		todo_value: totals.todo,
		todo_unit: 'km',
		todo_unit_text: 'km'
	} as unknown as WeekSeries;
}

/** Mon 10, Wed 8, Fri 6, Sun 16 — 40 km planned across the week. */
const PLAN = [
	dayRow(0, 10, null),
	dayRow(1, null, null),
	dayRow(2, 8, null),
	dayRow(3, null, null),
	dayRow(4, 6, null),
	dayRow(5, null, null),
	dayRow(6, 16, null)
];

function withDone(done: Record<number, number>) {
	return PLAN.map((row) =>
		done[row.order] === undefined ? row : { ...row, done_value: done[row.order] }
	);
}

const WEDNESDAY = new Date(2026, 7, 26);

describe('readWeekVolume', () => {
	it('takes the totals from the series, not from the rows', () => {
		// The rows carry 40 km of plan; the series total is what is shown.
		const volume = readWeekVolume(series({ done: 10, todo: 39.5 }, PLAN), WEDNESDAY);
		expect(volume.doneKm).toBe(10);
		expect(volume.plannedKm).toBe(39.5);
	});

	it('counts today as still ahead, so a session is not written off mid-morning', () => {
		// Monday run, Wednesday not yet — Wednesday, Friday and Sunday remain.
		const volume = readWeekVolume(series({ done: 10, todo: 40 }, withDone({ 0: 10 })), WEDNESDAY);
		expect(volume.reachableKm).toBe(40);
		expect(shortfallKm(volume)).toBe(0);
	});

	it('drops the ceiling by what a day gone by left unrun', () => {
		// Monday's 10 km was never run, and Monday is behind us.
		const volume = readWeekVolume(series({ done: 0, todo: 40 }, PLAN), WEDNESDAY);
		expect(volume.reachableKm).toBe(30);
		expect(shortfallKm(volume)).toBe(10);
	});

	it('counts a short day as partly missed rather than wholly missed', () => {
		const volume = readWeekVolume(series({ done: 4, todo: 40 }, withDone({ 0: 4 })), WEDNESDAY);
		expect(volume.reachableKm).toBe(34);
		expect(shortfallKm(volume)).toBe(6);
	});

	it('carries an overrun forward: extra kilometres raise the ceiling', () => {
		const volume = readWeekVolume(series({ done: 14, todo: 40 }, withDone({ 0: 14 })), WEDNESDAY);
		expect(volume.reachableKm).toBe(44);
		expect(shortfallKm(volume)).toBe(0);
	});

	it('reports no shortfall on the last day of a week that was run in full', () => {
		const sunday = new Date(2026, 7, 30);
		const volume = readWeekVolume(
			series({ done: 24, todo: 40 }, withDone({ 0: 10, 2: 8, 4: 6 })),
			sunday
		);
		// Sunday's 16 km is still ahead.
		expect(volume.reachableKm).toBe(40);
	});

	it('falls back to the is_today flag when the dates are unusable', () => {
		const undated = PLAN.map((row) => ({ ...row, date: '', is_today: row.order === 2 }));
		const volume = readWeekVolume(series({ done: 0, todo: 40 }, undated), WEDNESDAY);
		expect(volume.reachableKm).toBe(30);
	});

	it('claims nothing is unreachable when the series cannot say where today is', () => {
		// Neither usable dates nor an is_today: a bar saying kilometres are gone
		// had better be sure of it.
		const unanchored = PLAN.map((row) => ({ ...row, date: '', is_today: false }));
		const volume = readWeekVolume(series({ done: 12, todo: 40 }, unanchored), WEDNESDAY);
		expect(volume.reachableKm).toBe(40);
		expect(shortfallKm(volume)).toBe(0);
	});

	it('does the same for a series with no rows at all', () => {
		const volume = readWeekVolume(series({ done: 12, todo: 40 }), WEDNESDAY);
		expect(volume.reachableKm).toBe(40);
	});

	it('reads rows in schedule order, not in the order they arrived', () => {
		const shuffled = [PLAN[6], PLAN[0], PLAN[4], PLAN[2], PLAN[1], PLAN[5], PLAN[3]];
		const volume = readWeekVolume(series({ done: 0, todo: 40 }, shuffled), WEDNESDAY);
		expect(volume.reachableKm).toBe(30);
	});

	it('keeps the unit the API sent', () => {
		const miles = { ...series({ done: 8, todo: 20 }), todo_unit: 'mi', done_unit: 'mi' };
		expect(readWeekVolume(miles as WeekSeries, WEDNESDAY).unit).toBe('mi');
	});

	it('reads a week with nothing at all as all zeroes', () => {
		expect(readWeekVolume(null, WEDNESDAY)).toEqual({
			doneKm: 0,
			plannedKm: 0,
			reachableKm: 0,
			unit: 'km'
		});
	});
});

describe('hasWeekVolume', () => {
	const empty: WeekVolume = { doneKm: 0, plannedKm: 0, reachableKm: 0, unit: 'km' };

	it('is false for a week with nothing at all, so the navbar shows nothing', () => {
		expect(hasWeekVolume(empty)).toBe(false);
		expect(hasWeekVolume(null)).toBe(false);
		expect(hasWeekVolume(undefined)).toBe(false);
	});

	it('is true for a week with a plan, even before any of it is run', () => {
		expect(hasWeekVolume({ ...empty, plannedKm: 40, reachableKm: 40 })).toBe(true);
	});

	it('is true for an unplanned run — a run off the plan is still a run', () => {
		expect(hasWeekVolume({ ...empty, doneKm: 8, reachableKm: 8 })).toBe(true);
	});
});

describe('volumeBar', () => {
	const bar = (doneKm: number, plannedKm: number, reachableKm = plannedKm) =>
		volumeBar({ doneKm, plannedKm, reachableKm, unit: 'km' });

	it('leaves headroom past the plan, so a full week does not fill the track', () => {
		const full = bar(40, 40);
		expect(full.done).toBeCloseTo(1 / VOLUME_HEADROOM);
		expect(full.planned).toBeCloseTo(1 / VOLUME_HEADROOM);
	});

	it('puts the plan mark where the plan is, half way through the week', () => {
		const half = bar(20, 40);
		expect(half.done).toBeCloseTo(0.5 / VOLUME_HEADROOM);
		expect(half.planned).toBeCloseTo(1 / VOLUME_HEADROOM);
	});

	it('fits an overshoot inside the headroom without moving the plan mark', () => {
		const over = bar(44, 40, 44);
		expect(over.done).toBeCloseTo(1);
		expect(over.planned).toBeCloseTo(1 / VOLUME_HEADROOM);
	});

	it('stretches the track for an overshoot past the headroom rather than clipping it', () => {
		const way = bar(60, 40, 60);
		expect(way.done).toBe(1);
		expect(way.planned).toBeCloseTo(40 / 60);
	});

	it('shows the ceiling short of the plan when a day has been missed', () => {
		const missed = bar(0, 40, 30);
		expect(missed.done).toBe(0);
		expect(missed.reachable).toBeCloseTo(30 / 44);
		expect(missed.planned).toBeCloseTo(40 / 44);
	});

	it('never draws the ceiling behind what has already been run', () => {
		// A ceiling below the distance run is not a state the reader should see.
		const odd = bar(20, 40, 10);
		expect(odd.reachable).toBe(odd.done);
	});

	it('fills the track for a week run against no plan, and marks no plan on it', () => {
		const unplanned = bar(8, 0, 8);
		expect(unplanned.done).toBe(1);
		expect(unplanned.planned).toBe(0);
	});

	it('is empty for a week with nothing at all', () => {
		expect(bar(0, 0, 0)).toEqual({ done: 0, reachable: 0, planned: 0 });
	});
});
