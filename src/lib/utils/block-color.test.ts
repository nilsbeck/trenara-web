import { describe, it, expect } from 'vitest';
import { blockColor, blockTypeColor } from './block-color';

describe('blockColor', () => {
	it("uses the coach's pace-zone colour where the block carries one", () => {
		// A warm-up Trenara draws green and a run it draws red: the type alone
		// would have made them blue and yellow.
		expect(blockColor({ type: 'warmup', hex_graph: '#009E73' })).toBe('#009E73');
		expect(blockColor({ type: 'run', hex_graph: '#CC3311' })).toBe('#CC3311');
	});

	it('gives two runs at different paces different colours', () => {
		const fast = blockColor({ type: 'run', hex_graph: '#CC3311' });
		const steady = blockColor({ type: 'run', hex_graph: '#44A6D3' });
		expect(fast).not.toBe(steady);
	});

	it('falls back to the type colour when the block has no graph colour', () => {
		expect(blockColor({ type: 'run' })).toBe(blockTypeColor('run'));
		expect(blockColor({ type: 'rest', hex_graph: '' })).toBe(blockTypeColor('rest'));
	});

	it('refuses a value that is not a hex colour rather than writing it into a style', () => {
		// The colour lands inside a `style` attribute, where Svelte's escaping
		// does nothing for a `;` — a value like this would add a declaration of
		// its own and fetch from wherever it names.
		const hostile = 'red; background-image: url(https://example.test/x.png)';
		expect(blockColor({ type: 'run', hex_graph: hostile })).toBe(blockTypeColor('run'));
		expect(blockColor({ type: 'run', hex_graph: 'red' })).toBe(blockTypeColor('run'));
		expect(blockColor({ type: 'run', hex_graph: '#12345' })).toBe(blockTypeColor('run'));
	});

	it('accepts the short and alpha hex forms', () => {
		expect(blockColor({ type: 'run', hex_graph: '#fff' })).toBe('#fff');
		expect(blockColor({ type: 'run', hex_graph: '#44A6D380' })).toBe('#44A6D380');
	});
});

describe('blockTypeColor', () => {
	it('colours a block by what its type says it is', () => {
		expect(blockTypeColor('warmup')).toBe('#60a5fa');
		expect(blockTypeColor('cooldown')).toBe('#60a5fa');
		expect(blockTypeColor('run')).toBe('#facc15');
		expect(blockTypeColor('tempo')).toBe('#f97316');
		expect(blockTypeColor('interval')).toBe('#a855f7');
		expect(blockTypeColor('rest')).toBe('#94a3b8');
		expect(blockTypeColor('block')).toBe('#4ade80');
	});

	it('defaults to blue for a type it does not know, or none', () => {
		expect(blockTypeColor('core')).toBe('#60a5fa');
		expect(blockTypeColor(undefined)).toBe('#60a5fa');
	});
});
