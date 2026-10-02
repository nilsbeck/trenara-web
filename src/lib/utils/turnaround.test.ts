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

const shortRepShortCooldown = () => [
	m(600, 'warmup'),
	group(1, [m(400, 'rest'), m(800), m(400, 'rest')]),
	km(1, 'cooldown')
];

describe('findTurnaround', () => {
	it('turns halfway through a single steady run', () => {
		const t = findTurnaround(makeTraining([km(8)]));
		expect(t?.point).toMatchObject({ blockIndex: 0, subIndex: null, atKm: 4, intoKm: 4 });
		expect(t?.extraKm).toBe(0);
	});

	it('turns halfway through a long rep when that only shortens the cool-down', () => {
		// 13.02 km in all, so halfway is 6.51 km — 1.28 km into the second 2 km
		// rep. Before the rep would cost 2.55 km, more than the 2 km cool-down;
		// after it would lengthen the cool-down. The rep's own halfway, 1 km in,
		// takes 550 m off the cool-down.
		const t = findTurnaround(makeTraining(pyramid()))!;
		expect(t.totalKm).toBeCloseTo(13.022);
		expect(t.point).toMatchObject({ blockIndex: 1, subIndex: 2, round: null });
		expect(t.point.intoKm).toBeCloseTo(1);
		expect(t.point.atKm).toBeCloseTo(6.234);
		expect(t.extraKm).toBeCloseTo(-0.554);
	});

	it('turns before the rep without a cool-down', () => {
		// 11.02 km, halfway 5.51 — 0.28 km into the second rep. With nothing to
		// shorten, coming home early (and running on round the block) still wins.
		const t = findTurnaround({ ...makeTraining(pyramid().slice(0, 2)), has_cooldown: false })!;
		expect(t.point).toMatchObject({ blockIndex: 1, subIndex: 1 });
		expect(t.point.atKm).toBeCloseTo(5.234);
		expect(t.extraKm).toBeCloseTo(-0.554);
	});

	it('turns before a short rep even when its end is nearer, without a cool-down', () => {
		// 6.4 km, halfway 3.2 — 0.2 km before the 1 km rep ends. A 1 km rep is
		// not split at its middle, and early beats late.
		const t = findTurnaround(
			makeTraining([km(2, 'warmup'), group(1, [m(400, 'rest'), km(1), m(500, 'rest')]), km(2.5)])
		)!;
		expect(t.point).toMatchObject({ blockIndex: 1, subIndex: 0 });
		expect(t.extraKm).toBeCloseTo(-1.6);
	});

	it('turns before a short rep when the cool-down can give up the difference', () => {
		// 6 km, halfway 3.0 — 0.6 km into the 800 m rep. Turning before it takes
		// 1.2 km off the 2.4 km cool-down.
		const t = findTurnaround(
			makeTraining([
				km(2, 'warmup'),
				group(1, [m(400, 'rest'), m(800), m(400, 'rest')]),
				km(2.4, 'cooldown')
			])
		)!;
		expect(t.point).toMatchObject({ blockIndex: 1, subIndex: 0 });
		expect(t.extraKm).toBeCloseTo(-1.2);
	});

	it('turns after a short rep when the cool-down is too short to give it up', () => {
		// 3.2 km, halfway 1.6 — turning before would cost 1.2 km of a 1 km
		// cool-down, so the nearest place wins: after the rep, 0.4 km longer.
		const t = findTurnaround(makeTraining(shortRepShortCooldown()))!;
		expect(t.point).toMatchObject({ blockIndex: 1, subIndex: 1 });
		expect(t.extraKm).toBeCloseTo(0.4);
	});

	it('turns halfway through a long rep that opens the session', () => {
		const t = findTurnaround(makeTraining([group(1, [km(2), m(400, 'rest')])]))!;
		expect(t.point).toMatchObject({ blockIndex: 0, subIndex: 0 });
		expect(t.point.intoKm).toBeCloseTo(1);
		expect(t.extraKm).toBeCloseTo(-0.4);
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
		const text = describeTurnaround(findTurnaround(makeTraining(ladderX3()))!);
		expect(text.home).toBeNull();
	});

	it('names the shorter cool-down when the turn comes in the middle of a rep', () => {
		const text = describeTurnaround(findTurnaround(makeTraining(pyramid()))!);
		expect(text).toEqual({
			headline: 'Turn around at 6.2 km',
			detail: '1.0 km into the step above',
			home: 'Cool-down 550 m shorter'
		});
	});

	it('names a longer cool-down when turning early would cost more than it holds', () => {
		const text = describeTurnaround(findTurnaround(makeTraining(shortRepShortCooldown()))!);
		expect(text.home).toBe('Cool-down 400 m longer');
	});

	it('says home early, or extra to get home, without a cool-down', () => {
		const early = findTurnaround({ ...makeTraining(pyramid().slice(0, 2)), has_cooldown: false })!;
		expect(describeTurnaround(early).home).toBe('Home 550 m early');

		const late = findTurnaround(makeTraining([group(1, [m(800), m(400, 'rest')])]))!;
		expect(describeTurnaround(late).home).toBe('400 m extra to get home');
	});
});
