import type { ScheduledTraining, TrainingBlock } from '$lib/server/trenara/types';
import { paceToKmh, formatSpeedKmh } from './format';

export interface TreadmillInstruction {
	/** Human readable instruction text (falls back to block type). */
	title: string;
	/** Block type, used for colour coding. */
	type?: string;
	distance?: string;
	time?: string;
	/** Speed in km/h, pre-formatted (e.g. "13.3 km/h"), or null if not applicable. */
	speedLabel: string | null;
	/** 1-based repetition index, set when this step belongs to a repeated set. */
	repeatIndex?: number;
	/** Total number of repetitions, set alongside repeatIndex. */
	repeatTotal?: number;
	/** Label of the parent composite block (e.g. "4 x 800m"), if any. */
	groupLabel?: string;
}

/**
 * Flatten a training's blocks into a linear sequence of treadmill instructions.
 *
 * Composite blocks (interval / repeat sets) are expanded so each repetition
 * shows up as its own step, in the order they'd actually be run — rather than
 * requiring the runner to mentally track "which lap am I on".
 */
export function buildTreadmillInstructions(training: ScheduledTraining): TreadmillInstruction[] {
	const blocks = training.training?.blocks ?? [];
	const instructions: TreadmillInstruction[] = [];

	for (const block of blocks) {
		if (block.blocks && block.blocks.length > 0) {
			const repeat = block.repeat && block.repeat > 1 ? block.repeat : 1;
			for (let r = 1; r <= repeat; r++) {
				for (const sub of block.blocks) {
					instructions.push(
						toInstruction(
							sub,
							repeat > 1 ? r : undefined,
							repeat > 1 ? repeat : undefined,
							block.text
						)
					);
				}
			}
		} else {
			instructions.push(toInstruction(block));
		}
	}

	return instructions;
}

function toInstruction(
	block: TrainingBlock,
	repeatIndex?: number,
	repeatTotal?: number,
	groupLabel?: string
): TreadmillInstruction {
	// Prefer the precise decimal pace_value; fall back to the "MM:SS" string.
	const speedKmh =
		block.pace_value > 0
			? paceToKmh(block.pace_value, block.pace_unit)
			: block.pace
				? paceToKmh(block.pace, block.pace_unit)
				: null;

	return {
		title: block.text || block.type || 'Run',
		type: block.type,
		distance: block.distance || undefined,
		time: block.time || undefined,
		speedLabel: formatSpeedKmh(speedKmh),
		repeatIndex,
		repeatTotal,
		groupLabel
	};
}
