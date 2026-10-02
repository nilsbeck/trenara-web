import { describe, it, expect } from 'vitest';
import { describeTurnaround, findTurnaround, formatTurnDistance } from './turnaround';
import type { ScheduledTraining, TrainingBlock } from '$lib/server/trenara/types';

// ── Helpers ───────────────────────────────────────────────────
function makeBlock(overrides: Partial<TrainingBlock> = {}): TrainingBlock {
	return {
		order: 1,
		type: 'run',
		time: '10:00',
		time_in_sec: 600,
		time_value: 10,
		time_unit: 'min',
		distance: '2km',
		distance_value: 2,
		distance_unit: 'km',
		distance_unit_text: 'km',
		pace: '5:00',
		pace_value: 5,
		pace_unit: 'min/km',
		text: 'Run 2km',
		...overrides
	};
}

function makeTraining(
	blocks: TrainingBlock[],
	trainingOverrides: Record<string, unknown> = {}
): ScheduledTraining {
	return {
		id: 1,
		day: 0,
		day_long: '2025-03-03',
		title: 'Easy run',
		description: '',
		show_description_from: 0,
		nutritional_advice: '',
		type: 'run',
		icon_url: '',
		hex_training: '#000000',
		hex_completed: null,
		training: {
			blocks,
			total_time_in_sec: 0,
			core_time_in_sec: 0,
			core_distance: '',
			core_distance_value: 0,
			core_distance_unit: 'km',
			core_distance_unit_text: 'km',
			core_time: '',
			core_time_value: 0,
			core_time_unit: 'min',
			total_distance: '',
			total_distance_value: 0,
			total_distance_unit: 'km',
			total_distance_unit_text: 'km',
			total_time: '',
			total_time_value: 0,
			total_time_unit: 'min',
			...trainingOverrides
		},
		last_garmin_sync: '',
		can_be_edited: true,
		training_condition: {
			id: 1,
			height_difference: '0',
			surface: 'road',
			updated_at: 0,
			height: null,
			height_value: null,
			height_unit: null,
			height_unit_text: null
		}
	};
}

const km = (n: number, type = 'run') =>
	makeBlock({ type, distance_value: n, distance_unit: 'km', calc_distance_in_km: n });
const m = (n: number, type = 'run') =>
	makeBlock({ type, distance_value: n, distance_unit: 'm', calc_distance_in_km: n / 1000 });
const group = (repeat: number, blocks: TrainingBlock[]) =>
	makeBlock({ type: 'core', repeat, blocks, distance_value: null, calc_distance_in_km: null });

// The three sessions from the request that asked for this, as Trenara writes them.
const pyramid = () => [
	km(3, 'warmup'),
	group(1, [
		km(2),
		m(234, 'rest'),
		km(2),
		m(234, 'rest'),
		km(2),
		m(151, 'rest'),
		m(200),
		m(201, 'rest'),
		m(200),
		m(201, 'rest'),
		m(200),
		m(201, 'rest'),
		m(200)
	]),
	km(2, 'cooldown')
];

const ladderX3 = () => [
	km(4, 'warmup'),
	group(3, [m(600), m(166, 'rest'), km(1), m(125, 'rest'), m(800), m(586, 'rest')])
];

describe('findTurnaround', () => {
	it('turns halfway through a single steady run', () => {
		const t = findTurnaround(makeTraining([km(8)]));
		expect(t?.point).toMatchObject({ blockIndex: 0, subIndex: null, atKm: 4, intoKm: 4 });
		expect(t?.extraKm).toBe(0);
	});

	it('turns mid-rep when the rep is too long to step out of', () => {
		// 13.02 km in all, so halfway is 6.51 km — 1.28 km into the second 2 km
		// rep. Its nearer end is 0.72 km away, too far for an even split, so the
		// turn stays mid-rep.
		const t = findTurnaround(makeTraining(pyramid(), {}))!;
		expect(t.totalKm).toBeCloseTo(13.022);
		expect(t.point).toMatchObject({ blockIndex: 1, subIndex: 2, round: null });
		expect(t.point.intoKm).toBeCloseTo(1.277);
		expect(t.extraKm).toBe(0);
	});

	it('moves back when the cool-down is removed, and out of the rep it lands in', () => {
		// The server drops the block: 11.02 km, halfway at 5.51 — only 0.28 km
		// into the second rep, so the turn moves to just before it, at the end
		// of the recovery, and the runner is 0.55 km short of home at the end.
		const blocks = pyramid().slice(0, 2);
		const t = findTurnaround({ ...makeTraining(blocks), has_cooldown: false })!;
		expect(t.point).toMatchObject({ blockIndex: 1, subIndex: 1 });
		expect(t.point.atKm).toBeCloseTo(5.234);
		expect(t.point.intoKm).toBeCloseTo(t.point.stepKm);
		expect(t.extraKm).toBeCloseTo(-0.554);
	});

	it('leaves out a cool-down block still sent on a session without one', () => {
		const t = findTurnaround({ ...makeTraining(pyramid()), has_cooldown: false })!;
		expect(t.totalKm).toBeCloseTo(11.022);
	});

	it('names the round inside a repeated group', () => {
		// 4 + 3 × 3.277 = 13.83 km; halfway 6.92 lands in round 1's last recovery.
		const t = findTurnaround(makeTraining(ladderX3()))!;
		expect(t.point).toMatchObject({ blockIndex: 1, subIndex: 5, round: 1, rounds: 3 });
		expect(t.point.intoKm).toBeCloseTo(0.2245);
		expect(t.extraKm).toBe(0);
	});

	it('snaps to a boundary within fifty metres of it', () => {
		// With a 1.99 km cool-down, halfway is 33 m into round 2's first walk:
		// that is "after the 600 m of round 2".
		const blocks = [...ladderX3(), m(1990, 'cooldown')];
		const t = findTurnaround(makeTraining(blocks))!;
		expect(t.point).toMatchObject({ blockIndex: 1, subIndex: 0, round: 2 });
		expect(t.point.intoKm).toBeCloseTo(t.point.stepKm);
		expect(t.extraKm).toBe(0);
	});

	it('snaps forward to the end of a step it is just short of', () => {
		// 8.08 km, halfway 4.04 — twenty metres before the warm-up ends.
		const t = findTurnaround(makeTraining([km(4.06, 'warmup'), km(4.02)]))!;
		expect(t.point).toMatchObject({ blockIndex: 0 });
		expect(t.point.intoKm).toBeCloseTo(t.point.stepKm);
	});

	it('moves to the end of a rep that is close enough', () => {
		// 2 + 0.4 + 1 + 0.5 + 2.5 = 6.4, halfway 3.2 — 0.2 km before the 1 km
		// rep ends, so the turn waits for its end: 0.4 km more on the way home.
		const t = findTurnaround(
			makeTraining([km(2, 'warmup'), group(1, [m(400, 'rest'), km(1), m(500, 'rest')]), km(2.5)])
		)!;
		expect(t.point).toMatchObject({ blockIndex: 1, subIndex: 1 });
		expect(t.point.atKm).toBeCloseTo(3.4);
		expect(t.extraKm).toBeCloseTo(0.4);
	});

	it('moves to the start of a rep that is close enough', () => {
		// 2 + 0.4 + 1 + 0.5 + 1.4 = 5.3, halfway 2.65 — 0.25 into the 1 km rep.
		// Turning at its start (2.4 km) leaves 0.5 km short of home.
		const t = findTurnaround(
			makeTraining([km(2, 'warmup'), group(1, [m(400, 'rest'), km(1), m(500, 'rest')]), km(1.4)])
		)!;
		expect(t.point).toMatchObject({ blockIndex: 1, subIndex: 0 });
		expect(t.extraKm).toBeCloseTo(-0.5);
	});

	it('never splits a short rep, however far its end is', () => {
		// 2 + 0.4 + 0.8 + 0.4 + 1.9 = 5.5, halfway 2.75 — 0.35 km into the
		// 800 m rep, further from either end than a long rep would be moved. A
		// fast 800 m is run whole: the turn comes just before it, 0.7 km short.
		const t = findTurnaround(
			makeTraining([km(2, 'warmup'), group(1, [m(400, 'rest'), m(800), m(400, 'rest')]), km(1.9)])
		)!;
		expect(t.point).toMatchObject({ blockIndex: 1, subIndex: 0 });
		expect(t.point.atKm).toBeCloseTo(2.4);
		expect(t.extraKm).toBeCloseTo(-0.7);
	});

	it('treats a lone run in a group as steady, not a rep', () => {
		const t = findTurnaround(makeTraining([km(2, 'warmup'), group(1, [km(4)]), km(2)]))!;
		expect(t.point).toMatchObject({ blockIndex: 1, subIndex: 0 });
		expect(t.extraKm).toBe(0);
	});

	it('says nothing for a cross-trained session', () => {
		expect(findTurnaround({ ...makeTraining([km(8)]), cross_type: 'road_bike' })).toBeNull();
	});

	it('says nothing when a step has no distance', () => {
		const blocks = [km(2), makeBlock({ distance_value: null, calc_distance_in_km: null })];
		expect(findTurnaround(makeTraining(blocks))).toBeNull();
		expect(findTurnaround(makeTraining([]))).toBeNull();
	});

	it('reports in the session unit', () => {
		const t = findTurnaround(makeTraining([km(8)], { total_distance_unit_text: 'mi' }));
		expect(t?.unit).toBe('mi');
	});
});

describe('formatTurnDistance', () => {
	it('uses metres under a kilometre', () => {
		expect(formatTurnDistance(0.2245, 'km')).toBe('220 m');
		expect(formatTurnDistance(6.511, 'km')).toBe('6.5 km');
		expect(formatTurnDistance(8.04672, 'mi')).toBe('5.0 mi');
	});
});

describe('describeTurnaround', () => {
	it('gives the watch distance alone while still in the first step', () => {
		expect(describeTurnaround(findTurnaround(makeTraining([km(8)]))!)).toEqual({
			headline: 'Turn around at 4.0 km',
			detail: null,
			home: null
		});
	});

	it('places it inside a step and names the round', () => {
		const text = describeTurnaround(findTurnaround(makeTraining(ladderX3()))!);
		expect(text.headline).toBe('Turn around at 6.9 km');
		expect(text.detail).toBe('220 m into the step above in round 1 of 3');
	});

	it('places it at the end of a step', () => {
		const blocks = [...ladderX3(), m(1990, 'cooldown')];
		const text = describeTurnaround(findTurnaround(makeTraining(blocks))!);
		expect(text.detail).toBe('Once the step above is done in round 2 of 3');
	});

	it('says nothing about home when the split is even', () => {
		const text = describeTurnaround(findTurnaround(makeTraining(pyramid()))!);
		expect(text.detail).toBe('1.3 km into the step above');
		expect(text.home).toBeNull();
	});

	it('says what a turn kept out of a rep does to the way home', () => {
		const blocks = pyramid().slice(0, 2);
		const short = describeTurnaround(
			findTurnaround({ ...makeTraining(blocks), has_cooldown: false })!
		);
		expect(short.detail).toBe('Once the step above is done');
		expect(short.home).toBe('Kept out of the rep: 550 m short of home when it ends');

		const long = describeTurnaround(
			findTurnaround(
				makeTraining([km(2, 'warmup'), group(1, [m(400, 'rest'), km(1), m(500, 'rest')]), km(2.5)])
			)!
		);
		expect(long.home).toBe('Kept out of the rep: 400 m more to run home after the session');
	});
});
