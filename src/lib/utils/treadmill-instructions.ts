import type { ScheduledTraining, TrainingBlock } from '$lib/server/trenara/types';
import { paceToKmh, formatSpeedKmh } from './format';

export interface TreadmillInstruction {
	/** Human readable instruction text (falls back to block type). */
	title: string;
	/** Block type, used for colour coding. */
	type?: string;
	distance?: string;
	time?: string;
	/**
	 * Speed the runner should set, pre-formatted in the session's own unit
	 * (e.g. "9.2 km/h"), or null if not applicable.
	 */
	speedLabel: string | null;
	/**
	 * Running total distance covered through the end of this step, pre-formatted
	 * in the session's own unit (e.g. "3.2 km"), or null.
	 */
	cumulativeDistanceLabel: string | null;
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
	const unit = sessionDistanceUnit(training);

	// Running total distance (km) covered through the end of each step. The
	// server has no running total for a scheduled session — `sum_distance` only
	// exists on the laps of a completed entry — so this one has to be added up
	// here, out of the server's own per-block figures.
	let cumulativeKm = 0;
	const push = (
		block: TrainingBlock,
		repeatIndex?: number,
		repeatTotal?: number,
		groupLabel?: string
	) => {
		cumulativeKm += blockDistanceKm(block);
		instructions.push(
			toInstruction(block, cumulativeKm, unit, repeatIndex, repeatTotal, groupLabel)
		);
	};

	for (const block of blocks) {
		if (block.blocks && block.blocks.length > 0) {
			const repeat = block.repeat && block.repeat > 1 ? block.repeat : 1;
			for (let r = 1; r <= repeat; r++) {
				for (const sub of block.blocks) {
					push(sub, repeat > 1 ? r : undefined, repeat > 1 ? repeat : undefined, block.text);
				}
			}
		} else {
			push(block);
		}
	}

	return instructions;
}

/**
 * Best-effort distance of a single block in kilometres.
 *
 * Prefers the pre-computed `calc_distance_in_km`, falling back to the
 * block's own distance value/unit. Time-only blocks (e.g. "run for 5 min")
 * contribute 0 since there's no fixed distance — as do cross-trained
 * sessions, where every distance field comes back null.
 */
function blockDistanceKm(block: TrainingBlock): number {
	if (typeof block.calc_distance_in_km === 'number' && block.calc_distance_in_km > 0) {
		return block.calc_distance_in_km;
	}
	const value = block.distance_value;
	if (typeof value === 'number' && value > 0) {
		// "km" is tested before "m" so the shorter prefix doesn't swallow it.
		const unit = (block.distance_unit ?? '').toLowerCase();
		if (unit.startsWith('km')) return value;
		if (unit.startsWith('mi')) return value * 1.60934;
		if (unit.startsWith('m')) return value / 1000;
	}
	return 0;
}

/**
 * The unit the session states its own distances in — `km` for a metric
 * runner, `mi` for someone on miles. Read off the training's totals rather
 * than assumed, so the running total is never labelled in a unit the rest of
 * the app isn't using.
 */
function sessionDistanceUnit(training: ScheduledTraining): string {
	const t = training.training;
	return t?.total_distance_unit_text || t?.total_distance_unit || 'km';
}

/** Whether a unit string names kilometres (the unit `calc_distance_in_km` is in). */
function isKilometres(unit: string): boolean {
	return unit.toLowerCase().startsWith('km');
}

/**
 * Format a distance held in km for display in the session's own unit.
 *
 * A metric session — which is what `calc_distance_in_km` is already in — is
 * printed as-is; only a session that states its totals in miles needs the
 * number moved across.
 */
function formatSessionDistance(km: number, unit: string): string | null {
	if (km <= 0) return null;
	const value = isKilometres(unit) ? km : km / 1.60934;
	return `${value.toFixed(1)} ${unit}`;
}

/**
 * The speed to set on the treadmill, taken from the session data.
 *
 * The API already renders it in the runner's own unit — `pace_per_hour` is a
 * display string like "9.18 km/h" — so deriving it from the min/km pace only
 * risks disagreeing with what the rest of the app shows, and hardcodes km/h
 * for anyone running in miles. The digits are re-rounded to one decimal
 * because that is the granularity a treadmill's speed control actually has.
 *
 * Computing from pace stays as a fallback: `pace_per_hour` is absent on
 * cross-trained sessions and on older payloads.
 */
function blockSpeedLabel(block: TrainingBlock): string | null {
	const reported = block.pace_per_hour?.trim();
	if (reported) {
		const match = /^([\d.]+)\s*(.*)$/.exec(reported);
		const value = match ? Number(match[1]) : NaN;
		if (isFinite(value) && value > 0) {
			const unit = (match?.[2] || block.pace_per_hour_unit || '').trim();
			return unit ? `${value.toFixed(1)} ${unit}` : value.toFixed(1);
		}
	}

	// Prefer the precise decimal pace_value; fall back to the "MM:SS" string.
	// Both are null on a cross-trained session, which simply has no pace.
	const paceUnit = block.pace_unit ?? undefined;
	const speedKmh =
		typeof block.pace_value === 'number' && block.pace_value > 0
			? paceToKmh(block.pace_value, paceUnit)
			: block.pace
				? paceToKmh(block.pace, paceUnit)
				: null;
	return formatSpeedKmh(speedKmh);
}

function toInstruction(
	block: TrainingBlock,
	cumulativeKm: number,
	unit: string,
	repeatIndex?: number,
	repeatTotal?: number,
	groupLabel?: string
): TreadmillInstruction {
	return {
		// Keep the block text whole. Splitting on whitespace to shorten it kept
		// only the first token, which turns "Warm up" into "Warm" and
		// "800m fast" into "800m" — the part that carries the instruction is lost.
		title: block.text || block.type || 'Run',
		type: block.type,
		distance: block.distance || undefined,
		time: block.time || undefined,
		speedLabel: blockSpeedLabel(block),
		cumulativeDistanceLabel: formatSessionDistance(cumulativeKm, unit),
		repeatIndex,
		repeatTotal,
		groupLabel
	};
}
