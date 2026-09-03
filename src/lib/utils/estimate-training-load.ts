import type { TrainingBlock } from '$lib/server/trenara/types';

/**
 * Estimates the rTSS-style load a training will earn, before it is run.
 *
 * Sums `100 * (threshold/pace)^2 * hours` over every leaf block, expanding
 * `core` groups by their `repeat` count first. This is the same arithmetic
 * `done_tss` comes back with (see `docs/backend-api.md`, "GET /api/dashboard/"),
 * applied ahead of time to the plan's blocks instead of after the fact to a
 * logged session — so it needs the runner's current threshold pace passed in
 * rather than reading it off a finished entry.
 *
 * `thresholdPaceSecPerKm` should be fresh: it is `User.pace_lt2_value` from
 * `GET /api/me` (`userApi.getCurrentUser`), which the coach recalibrates
 * through the plan — pulling it at call time rather than caching it long-term
 * is what keeps this correct as fitness shifts over the 12 weeks, and correct
 * per runner.
 *
 * Blocks with no pace (rest defined by time only, a cross-trained leg) are
 * skipped rather than treated as zero load, matching how those legs carry no
 * `pace_value` in the API rather than a `pace_value` of zero.
 */
export function estimateTrainingLoad(
	blocks: TrainingBlock[],
	thresholdPaceSecPerKm: number
): number {
	let squaredPaceWeightedHours = 0;
	for (const block of leafBlocks(blocks)) {
		if (!block.time_in_sec || !block.pace_value) continue;
		squaredPaceWeightedHours += block.time_in_sec / block.pace_value ** 2;
	}
	return (100 * thresholdPaceSecPerKm ** 2 * squaredPaceWeightedHours) / 3600;
}

function* leafBlocks(blocks: TrainingBlock[]): Generator<TrainingBlock> {
	for (const block of blocks) {
		if (block.blocks && block.blocks.length > 0) {
			for (let i = 0; i < (block.repeat ?? 1); i++) yield* leafBlocks(block.blocks);
		} else {
			yield block;
		}
	}
}
