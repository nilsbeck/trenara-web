import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/svelte';
import SessionBlocks from '#lib/components/training/session-blocks.svelte';
import type { ScheduledTraining, TrainingBlock } from '#lib/server/trenara/types.js';
import type { Turnaround } from '#lib/utils/turnaround.js';
import { shapeSegments } from '#lib/utils/session-setup.js';

const block = (text: string, overrides: Partial<TrainingBlock> = {}): TrainingBlock => ({
	order: 1,
	type: 'run',
	text,
	...overrides
});

const blocks = [
	block('Warm-up: 4km', { type: 'warmup' }),
	block('Block', {
		type: 'core',
		repeat: 3,
		blocks: [block('Run 600m'), block('Walk 02:00', { type: 'rest' }), block('Run 1km')]
	})
];

const turnAfterWalk: Turnaround = {
	point: {
		blockIndex: 1,
		subIndex: 1,
		round: 2,
		rounds: 3,
		atKm: 6.9,
		intoKm: 0.1,
		stepKm: 0.166
	},
	extraKm: 0,
	cooldownKm: 0,
	totalKm: 13.8,
	unit: 'km'
};

function renderBlocks(turnaround: Turnaround | null) {
	return render(SessionBlocks, {
		blocks,
		cooldownIndex: -1,
		cooldownNeedsOwnRow: false,
		cooldownRemoved: false,
		cooldownPending: false,
		onCooldownChange: () => {},
		turnaround
	});
}

describe('SessionBlocks turnaround marker', () => {
	afterEach(() => cleanup());

	it('sits straight after the step the turn falls in', () => {
		renderBlocks(turnAfterWalk);
		const marker = screen.getByTestId('turnaround-marker');
		expect(marker.textContent).toContain('Turn around at 6.9 km');
		expect(marker.textContent).toContain('100 m into the step above in round 2 of 3');

		const walk = screen.getByText('Walk 02:00').parentElement!;
		expect(walk.nextElementSibling).toBe(marker);
	});

	it('sits after a simple block', () => {
		renderBlocks({
			...turnAfterWalk,
			point: { ...turnAfterWalk.point, blockIndex: 0, subIndex: null, round: null, rounds: null }
		});
		const warmUp = screen.getByText('Warm-up: 4km').parentElement!;
		expect(warmUp.nextElementSibling).toBe(screen.getByTestId('turnaround-marker'));
	});

	it('draws nothing when there is no turn to show', () => {
		renderBlocks(null);
		expect(screen.queryByTestId('turnaround-marker')).toBeNull();
	});
});

/** The swatch drawn beside a line of the plan: the dot of a block, the bar of a step. */
function swatchOf(text: string): string {
	return (screen.getByText(text).previousElementSibling as HTMLElement).style.backgroundColor;
}

const EASY = 'var(--color-block-easy)';
const RUN = 'var(--color-block-run)';
const REST = 'var(--color-block-rest)';

describe('SessionBlocks colours', () => {
	afterEach(() => cleanup());

	// The tempo run from the report: Trenara colours the warm-up green, the
	// 04:13 step red and the 05:06–05:29 step blue by pace zone. The plan draws
	// by kind of step instead, and the shape bar above it now does the same.
	const tempo: TrainingBlock[] = [
		block('Warm-up: 5km in 24:34', {
			type: 'warmup',
			hex_graph: '#009E73',
			distance_value: 5,
			distance_unit: 'km'
		}),
		block('Block', {
			type: 'core',
			repeat: 1,
			blocks: [
				block('Run 5km in 21:05', {
					hex_graph: '#CC3311',
					distance_value: 5,
					distance_unit: 'km'
				}),
				block('Run 5km in 26:24', {
					hex_graph: '#44A6D3',
					distance_value: 5,
					distance_unit: 'km'
				})
			]
		})
	];

	function renderPlan(planned: TrainingBlock[] = tempo, cooldownIndex = -1) {
		return render(SessionBlocks, {
			blocks: planned,
			cooldownIndex,
			cooldownNeedsOwnRow: false,
			cooldownRemoved: false,
			cooldownPending: false,
			onCooldownChange: () => {}
		});
	}

	it('draws each step by its kind, whatever pace zone the coach put it in', () => {
		renderPlan();
		expect(swatchOf('Warm-up: 5km in 24:34')).toBe(EASY);
		expect(swatchOf('Run 5km in 21:05')).toBe(RUN);
		expect(swatchOf('Run 5km in 26:24')).toBe(RUN);
	});

	it('splits a group’s dot between the colours of its first and last step', () => {
		renderPlan(blocks);
		const dot = screen.getByText('Block ×3').previousElementSibling!;
		const [left, right] = Array.from(dot.children) as HTMLElement[];
		expect(left.style.backgroundColor).toBe(RUN);
		expect(right.style.backgroundColor).toBe(RUN);
		expect(swatchOf('Walk 02:00')).toBe(REST);
	});

	it('agrees with the shape bar above it, step for step', () => {
		renderPlan();
		const training = { training: { blocks: tempo } } as unknown as ScheduledTraining;
		const bar = shapeSegments(training).map((s) => s.color);
		const list = ['Warm-up: 5km in 24:34', 'Run 5km in 21:05', 'Run 5km in 26:24'].map(swatchOf);
		expect(list).toEqual(bar);
	});

	it('colours the cool-down control like the warm-up', () => {
		renderPlan([block('Cool-down: 1km', { type: 'cooldown', hex_graph: '#90CFF1' })], 0);
		expect(swatchOf('Cool-down: 1km')).toBe(EASY);
	});
});
