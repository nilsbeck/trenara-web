import { describe, it, expect } from 'vitest';
import { estimateTrainingLoad } from './estimate-training-load';
import type { TrainingBlock } from '$lib/server/trenara/types';

function leaf(type: string, timeInSec: number, paceValue: number | null): TrainingBlock {
	return { order: 0, type, time_in_sec: timeInSec, pace_value: paceValue };
}

// Warm-up 15:00 (2.72km) / Block x8 (Run 400m in 01:32, Walk 01:45 over 145m) /
// Cooldown 15:00 (2.41km) — the session from the coach's message, load 54.
const sessionBlocks: TrainingBlock[] = [
	leaf('warmup', 900, 331),
	{
		order: 1,
		type: 'core',
		repeat: 8,
		blocks: [leaf('run', 92, 230), leaf('rest', 105, 724)]
	},
	leaf('run', 900, 373)
];

describe('estimateTrainingLoad', () => {
	it('matches the coach-reported load for the threshold pace it implies', () => {
		// Solved from the reported load of 54 against this session's blocks —
		// not an independently known account value, but it lands within a
		// percent of the pace_lt2/pace_for_goal pair docs/backend-api.md
		// captured for a different account (245-252 s/km), which is the
		// cross-check that the formula is the right one.
		expect(estimateTrainingLoad(sessionBlocks, 253.8)).toBeCloseTo(54, 0);
	});

	it('expands repeated core blocks by their repeat count', () => {
		const once = estimateTrainingLoad(
			[{ order: 0, type: 'core', repeat: 1, blocks: [leaf('run', 92, 230)] }],
			253.8
		);
		const twice = estimateTrainingLoad(
			[{ order: 0, type: 'core', repeat: 2, blocks: [leaf('run', 92, 230)] }],
			253.8
		);
		expect(twice).toBeCloseTo(once * 2, 5);
	});

	it('skips blocks with no pace instead of scoring them as zero effort', () => {
		const withRest = estimateTrainingLoad(
			[leaf('run', 92, 230), leaf('rest', 240, null)],
			253.8
		);
		const withoutRest = estimateTrainingLoad([leaf('run', 92, 230)], 253.8);
		expect(withRest).toBe(withoutRest);
	});

	it('scores nothing for an empty plan', () => {
		expect(estimateTrainingLoad([], 253.8)).toBe(0);
	});
});
