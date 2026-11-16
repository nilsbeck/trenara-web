import { describe, it, expect } from 'vitest';
import type { TrainingBlock } from '#lib/server/trenara/types.js';
import { blockColor } from './block-color';

describe('blockColor', () => {
	it('colours a block by what kind of step it is', () => {
		expect(blockColor({ type: 'warmup' })).toBe('var(--color-block-easy)');
		expect(blockColor({ type: 'run' })).toBe('var(--color-block-run)');
		expect(blockColor({ type: 'rest' })).toBe('var(--color-block-rest)');
		expect(blockColor({ type: 'cooldown' })).toBe('var(--color-block-easy)');
	});

	it('gives the warm-up and the cool-down the same colour', () => {
		expect(blockColor({ type: 'warmup' })).toBe(blockColor({ type: 'cooldown' }));
	});

	it("ignores the coach's pace-zone colour, so two runs at different paces match", () => {
		// The pace zone is what the header used to draw from, while the plan
		// drew by type; the two disagreed. Type is the one scale now.
		const fastStep: TrainingBlock = { order: 1, type: 'run', hex_graph: '#CC3311' };
		const steadyStep: TrainingBlock = { order: 2, type: 'run', hex_graph: '#44A6D3' };
		const fast = blockColor(fastStep);
		const steady = blockColor(steadyStep);
		expect(fast).toBe(steady);
		expect(fast).toBe('var(--color-block-run)');
	});

	it('reads the type without regard to case or spelling of the warm-up', () => {
		expect(blockColor({ type: 'WarmUp' })).toBe('var(--color-block-easy)');
		expect(blockColor({ type: 'warm_up' })).toBe('var(--color-block-easy)');
		expect(blockColor({ type: 'Cool-down' })).toBe('var(--color-block-easy)');
	});

	it('counts a step it does not recognise as running', () => {
		// Only warmup, run, rest and cooldown have been seen in captured
		// traffic. Anything else is most likely another running step, and the
		// bulk of every session is drawn in the run colour.
		expect(blockColor({ type: 'interval' })).toBe('var(--color-block-run)');
		expect(blockColor({ type: undefined as unknown as string })).toBe('var(--color-block-run)');
	});

	it('draws a recovery or a walk as a rest', () => {
		expect(blockColor({ type: 'recovery' })).toBe('var(--color-block-rest)');
		expect(blockColor({ type: 'walk' })).toBe('var(--color-block-rest)');
	});
});
