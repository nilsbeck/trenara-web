import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/svelte';
import SessionBlocks from '$lib/components/training/session-blocks.svelte';
import type { TrainingBlock } from '$lib/server/trenara/types';
import type { Turnaround } from '$lib/utils/turnaround';

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
	exact: {
		blockIndex: 1,
		subIndex: 1,
		round: 2,
		rounds: 3,
		atKm: 6.9,
		intoKm: 0.1,
		stepKm: 0.166
	},
	atRepBoundary: null,
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
			exact: { ...turnAfterWalk.exact, blockIndex: 0, subIndex: null, round: null, rounds: null }
		});
		const warmUp = screen.getByText('Warm-up: 4km').parentElement!;
		expect(warmUp.nextElementSibling).toBe(screen.getByTestId('turnaround-marker'));
	});

	it('draws nothing when there is no turn to show', () => {
		renderBlocks(null);
		expect(screen.queryByTestId('turnaround-marker')).toBeNull();
	});
});
