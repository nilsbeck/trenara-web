import { describe, it, expect } from 'vitest';
import {
	readPlanWeeks,
	planWeekFor,
	upcomingWeeks,
	planWeekWarning,
	weeksAwayLabel,
	isoWeekStart
} from './plan-weeks';
import type { UserStats } from '$lib/server/trenara/types';

type GoalSeries = UserStats['graph_stats']['goal'];

function row(week: number, month: string, todo: number, done: number | null, isCurrent = false) {
	return {
		week,
		order: week - 28,
		month,
		year: 2026,
		is_current_week: isCurrent,
		done: done === null ? null : `${done}km`,
		done_value: done,
		done_unit: done === null ? null : 'km',
		done_unit_text: done === null ? null : 'km',
		todo: `${todo}km`,
		todo_value: todo,
		todo_unit: 'km',
		todo_unit_text: 'km'
	};
}

/**
 * A goal series captured on 2026-08-24, totals included.
 *
 * The rows add to 564.57 km while the response states 595.36: the goal starts
 * in week 27 and the series starts at 28, so the first week has no row. That
 * gap is the point of the fixture as much as the volumes are.
 */
function referenceSeries(): GoalSeries {
	return {
		data: [
			row(28, 'July', 34.24, 9.18),
			row(29, 'July', 37.98, 35.32),
			row(30, 'July', 37.56, 30.3),
			row(31, 'July', 43.8, 23.09),
			row(32, 'August', 64.1, null),
			row(33, 'August', 51.52, null),
			row(34, 'August', 59.68, 53.8),
			row(35, 'August', 36.94, 8, true),
			row(36, 'August', 55.57, null),
			row(37, 'September', 55.85, null),
			row(38, 'September', 52.08, null),
			row(39, 'September', 35.25, null)
		],
		done: '159.69km',
		done_value: 159.69,
		done_unit: 'km',
		done_unit_text: 'km',
		todo: '595.36km',
		todo_value: 595.36,
		todo_unit: 'km',
		todo_unit_text: 'km'
	};
}

function roleOf(plan: ReturnType<typeof readPlanWeeks>, week: number) {
	return plan.weeks.find((w) => w.week === week)?.role;
}

describe('readPlanWeeks', () => {
	it('names what each week of the plan is for', () => {
		const plan = readPlanWeeks(referenceSeries());

		expect(roleOf(plan, 32)).toBe('peak');
		expect(roleOf(plan, 33)).toBe('recovery');
		expect(roleOf(plan, 35)).toBe('recovery');
		expect(roleOf(plan, 39)).toBe('taper');
		expect(roleOf(plan, 29)).toBe('build');
		expect(roleOf(plan, 31)).toBe('build');
		expect(roleOf(plan, 34)).toBe('build');
		expect(roleOf(plan, 36)).toBe('build');
		expect(roleOf(plan, 30)).toBe('steady');
		expect(roleOf(plan, 37)).toBe('steady');
	});

	it('reads a 7% easing as levelling off rather than the start of a taper', () => {
		// Week 38 drops, but only by 7%. Calling that a taper would tell a runner
		// to back off in a week that is still 52 km of work.
		expect(roleOf(readPlanWeeks(referenceSeries()), 38)).toBe('steady');
	});

	it('says which way each week can go wrong', () => {
		const plan = readPlanWeeks(referenceSeries());
		const direction = (week: number) => plan.weeks.find((w) => w.week === week)?.direction;

		expect(direction(32)).toBe('complete');
		expect(direction(36)).toBe('complete');
		expect(direction(35)).toBe('respect');
		expect(direction(39)).toBe('respect');
		expect(direction(37)).toBe('none');
	});

	it('takes the totals from the response rather than adding the rows up', () => {
		const plan = readPlanWeeks(referenceSeries());
		const rowSum = plan.weeks.reduce((sum, w) => sum + w.plannedKm, 0);

		expect(plan.totalPlannedKm).toBe(595.36);
		expect(plan.totalCompletedKm).toBe(159.69);
		expect(rowSum).toBeLessThan(plan.totalPlannedKm);
		expect(plan.hasGaps).toBe(true);
	});

	it('leaves a week with no data as no data, not as zero', () => {
		const plan = readPlanWeeks(referenceSeries());

		expect(plan.weeks.find((w) => w.week === 32)?.completedKm).toBeNull();
		expect(plan.weeks.find((w) => w.week === 34)?.completedKm).toBe(53.8);
	});

	it('refuses to read a ramp across a missing week', () => {
		const series = referenceSeries();
		series.data = series.data.filter((r) => r.week !== 33);
		const plan = readPlanWeeks(series);

		// Week 34 follows a hole, so its jump is unknowable — 59.68 against week
		// 32's 64.1 would be a ratio to the week before last, not a ramp.
		expect(plan.weeks.find((w) => w.week === 34)?.ramp).toBeNull();
		expect(roleOf(plan, 34)).toBe('steady');
		expect(roleOf(plan, 32)).toBe('peak');
		expect(plan.hasGaps).toBe(true);
	});

	it('has no ramp for the first row it was given', () => {
		const plan = readPlanWeeks(referenceSeries());
		expect(plan.weeks[0].ramp).toBeNull();
		expect(plan.weeks[0].role).toBe('steady');
	});

	it('measures a ramp and a share against the plan', () => {
		const plan = readPlanWeeks(referenceSeries());
		const peak = plan.weeks.find((w) => w.week === 32);

		expect(peak?.ramp).toBeCloseTo(1.463, 3);
		expect(peak?.share).toBeCloseTo(0.108, 3);
	});

	it('survives a goal with no series at all', () => {
		expect(readPlanWeeks(null).weeks).toEqual([]);
		expect(readPlanWeeks(undefined).hasGaps).toBe(false);
		expect(readPlanWeeks({ ...referenceSeries(), data: [] }).totalPlannedKm).toBe(595.36);
	});
});

describe('planWeekFor', () => {
	it('finds the week a date falls in', () => {
		const plan = readPlanWeeks(referenceSeries());

		// Monday, and the Sunday that closes the same week.
		expect(planWeekFor(plan, new Date(2026, 7, 24))?.week).toBe(35);
		expect(planWeekFor(plan, new Date(2026, 7, 30))?.week).toBe(35);
	});

	it('returns nothing for a date the plan does not cover', () => {
		const plan = readPlanWeeks(referenceSeries());

		expect(planWeekFor(plan, new Date(2026, 4, 4))).toBeNull();
		expect(planWeekFor(plan, new Date(2026, 10, 2))).toBeNull();
	});
});

describe('isoWeekStart', () => {
	it('lands on the Monday the API means', () => {
		expect(isoWeekStart(2026, 35)).toEqual(new Date(2026, 7, 24));
		expect(isoWeekStart(2026, 27)).toEqual(new Date(2026, 5, 29));
		// Week 1 of 2026 starts in the previous December.
		expect(isoWeekStart(2026, 1)).toEqual(new Date(2025, 11, 29));
	});
});

describe('upcomingWeeks', () => {
	const plan = readPlanWeeks(referenceSeries());
	// The Wednesday of week 35, which is a recovery week already under way.
	const midWeek35 = new Date(2026, 7, 26);

	it('warns about the weeks that change what to do, soonest first', () => {
		const ahead = upcomingWeeks(plan, midWeek35);

		expect(ahead.map((u) => u.week.week)).toEqual([36, 39]);
		expect(ahead[0].weeksAway).toBe(1);
		expect(ahead[1].weeksAway).toBe(4);
	});

	it('leaves out the week already under way', () => {
		// A recovery week you are three days into is not a warning any more.
		expect(upcomingWeeks(plan, midWeek35).map((u) => u.week.week)).not.toContain(35);
	});

	it('never returns an ordinary week', () => {
		const ahead = upcomingWeeks(plan, new Date(2026, 6, 20), 10);
		expect(ahead.every((u) => u.week.role !== 'steady')).toBe(true);
	});

	it('has nothing to say once the plan is behind you', () => {
		expect(upcomingWeeks(plan, new Date(2026, 9, 5))).toEqual([]);
	});

	it('names the distance the way a person would', () => {
		expect(weeksAwayLabel(1)).toBe('Next week');
		expect(weeksAwayLabel(4)).toBe('In 4 weeks');
	});
});

describe('planWeekWarning', () => {
	const plan = readPlanWeeks(referenceSeries());
	const warn = (week: number) => planWeekWarning(plan.weeks.find((w) => w.week === week)!);

	it('says what is coming and what to do about it', () => {
		expect(warn(32)).toEqual({
			headline: 'the biggest week of the plan, at 64 km',
			advice: 'Worth clearing the diary for.',
			direction: 'complete'
		});
		expect(warn(36)?.headline).toBe('a step up to 56 km, 50% above the week before');
	});

	it('tells a runner to leave an easy week alone', () => {
		// The failure mode of a down week is doing more, and the runner most
		// likely to do that is the one catching up.
		expect(warn(35)).toMatchObject({
			advice: 'The drop is deliberate — resist topping it up.',
			direction: 'respect'
		});
		expect(warn(39)?.advice).toContain('Freshness now');
	});

	it('has nothing to say about an ordinary week', () => {
		expect(warn(37)).toBeNull();
	});
});
