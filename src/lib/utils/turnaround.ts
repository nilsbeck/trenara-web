import type { ScheduledTraining, TrainingBlock } from '$lib/server/trenara/types';
import { blockDistanceKm, isKilometres, sessionDistanceUnit } from './treadmill-instructions';

/**
 * Where a step sits in the block list as the session card draws it: a
 * top-level block, and — inside a group — which of its sub-blocks and which
 * repetition of the group. A group is drawn once however often it repeats, so
 * the round is what tells the runner which pass through it is meant.
 */
export interface StepPosition {
	blockIndex: number;
	/** Index within the group's `blocks`, or null for a simple block. */
	subIndex: number | null;
	/** 1-based repetition, or null where the group runs once. */
	round: number | null;
	rounds: number | null;
}

export interface TurnPoint extends StepPosition {
	/** Distance from the start, in km, at which to turn. */
	atKm: number;
	/**
	 * How far into the step at `position` to turn, in km. Zero never occurs:
	 * a point on the boundary between two steps is placed at the end of the
	 * first, so the marker always sits *after* the step it refers to and
	 * `intoKm === stepKm` means "once this step is done".
	 */
	intoKm: number;
	stepKm: number;
}

export interface Turnaround {
	/** Where to turn. */
	point: TurnPoint;
	/**
	 * What turning at `point` rather than at exactly halfway does to the way
	 * home: positive is that much further to run once the session is over,
	 * negative that much short of the door when it ends. Zero unless the turn
	 * was moved out of a rep (see `CALM_SHIFT_KM`).
	 */
	extraKm: number;
	totalKm: number;
	/** The session's own distance unit, so the figures are never labelled in another. */
	unit: string;
}

interface Step extends StepPosition {
	block: TrainingBlock;
	startKm: number;
	endKm: number;
	/** A fast rep between recoveries — the one kind of step not to turn in. */
	isRep: boolean;
}

/**
 * Closer than this to a step boundary and the point is the boundary. Fifty
 * metres is inside what a GPS watch drifts over half a session, so splitting
 * hairs below it would only put "20 m into the walk" on screen.
 */
const SNAP_KM = 0.05;

/**
 * How far a turn may move to get out of a rep. Wheeling round mid-interval
 * breaks it, and a few hundred metres either way costs little at the door —
 * but past that the split stops being even, and turning 1 km into a 2 km rep
 * is the better of the two. Out and back, the shift counts twice at home.
 */
const CALM_SHIFT_KM = 0.3;

/**
 * Where to turn on an out-and-back so the runner is home when the session ends.
 *
 * It is the halfway point of the blocks as planned, which is what makes it
 * follow the cool-down: the server drops the cool-down's block when the runner
 * removes it, the total shrinks, and the point moves back with it. A block
 * still typed as a cool-down on a session that reports `has_cooldown: false`
 * is left out as well, so the answer is the same whichever way the server
 * represents a removed one.
 *
 * Null where there is nothing honest to say: a cross-trained session, a
 * session with no distance, or one where any step lacks a distance — a single
 * unknown step anywhere would shift the halfway point by an amount there is no
 * way to show.
 */
export function findTurnaround(training: ScheduledTraining): Turnaround | null {
	if (training.cross_type) return null;

	const steps = flatten(training);
	if (steps.length === 0 || steps.some((s) => s.endKm - s.startKm <= 0)) return null;

	const totalKm = steps[steps.length - 1].endKm;
	const halfKm = totalKm / 2;
	const unit = sessionDistanceUnit(training);

	let i = steps.findIndex((s) => s.endKm >= halfKm);
	// Just past a boundary reads as the boundary: the end of the step before.
	if (i > 0 && halfKm - steps[i].startKm < SNAP_KM) i -= 1;
	const step = steps[i];
	const intoKm = step.endKm - halfKm < SNAP_KM ? step.endKm - step.startKm : halfKm - step.startKm;

	const midRep = step.isRep && intoKm < step.endKm - step.startKm;
	const calm = midRep ? repBoundary(steps, i, halfKm) : null;
	if (calm && Math.abs(calm.extraKm) <= 2 * CALM_SHIFT_KM) {
		return { ...calm, totalKm, unit };
	}

	return { point: pointIn(step, intoKm), extraKm: 0, totalKm, unit };
}

function pointIn(step: Step, intoKm: number): TurnPoint {
	return {
		blockIndex: step.blockIndex,
		subIndex: step.subIndex,
		round: step.round,
		rounds: step.rounds,
		atKm: step.startKm + intoKm,
		intoKm,
		stepKm: step.endKm - step.startKm
	};
}

/**
 * The nearer end of the rep at `i`. Its start is expressed as the end of the
 * step before, so the marker keeps its one rule of sitting after a step. Out
 * and back, turning `d` later adds `d` both ways — hence the doubling.
 */
function repBoundary(
	steps: Step[],
	i: number,
	halfKm: number
): { point: TurnPoint; extraKm: number } {
	const rep = steps[i];
	const useStart = i > 0 && halfKm - rep.startKm < rep.endKm - halfKm;
	const at = useStart ? steps[i - 1] : rep;
	return {
		point: pointIn(at, at.endKm - at.startKm),
		extraKm: 2 * (at.endKm - halfKm)
	};
}

/**
 * Every step in the order it is run, repeats expanded, with where it starts
 * and ends — the same walk `buildTreadmillInstructions` makes, kept beside the
 * position the card draws it at.
 */
function flatten(training: ScheduledTraining): Step[] {
	const blocks = training.training?.blocks ?? [];
	const dropCooldown = training.has_cooldown === false;
	const steps: Step[] = [];
	let km = 0;

	const push = (block: TrainingBlock, position: StepPosition, isRep: boolean) => {
		const startKm = km;
		km += blockDistanceKm(block);
		steps.push({ ...position, block, startKm, endKm: km, isRep });
	};

	blocks.forEach((block, blockIndex) => {
		if (dropCooldown && (block.type ?? '').toLowerCase().includes('cool')) return;

		const subs = block.blocks ?? [];
		if (subs.length === 0) {
			push(block, { blockIndex, subIndex: null, round: null, rounds: null }, false);
			return;
		}

		const rounds = block.repeat && block.repeat > 1 ? block.repeat : 1;
		// A rep is a run between recoveries. A group of one long run — a tempo
		// block — has no rhythm to break, and turning inside it is fine.
		const hasRecovery = subs.some((sub) => !isRunType(sub.type));
		for (let round = 1; round <= rounds; round++) {
			subs.forEach((sub, subIndex) =>
				push(
					sub,
					{
						blockIndex,
						subIndex,
						round: rounds > 1 ? round : null,
						rounds: rounds > 1 ? rounds : null
					},
					hasRecovery && isRunType(sub.type)
				)
			);
		}
	});

	return steps;
}

function isRunType(type: string | undefined): boolean {
	return (type ?? '').toLowerCase() === 'run';
}

/**
 * A distance held in km, in the session's own unit: `6.5 km`, `4.0 mi`, and
 * metres under a kilometre — `280 m` says "a little way into the walk" more
 * plainly than `0.3 km`.
 */
export function formatTurnDistance(km: number, unit: string): string {
	if (isKilometres(unit)) {
		if (km < 1) return `${Math.round(km * 100) * 10} m`;
		return `${km.toFixed(1)} km`;
	}
	return `${(km / 1.60934).toFixed(1)} ${unit}`;
}

export interface TurnaroundText {
	/** `Turn around at 6.5 km` — the figure a watch shows, so it holds on the road. */
	headline: string;
	/** Where that is in the plan, or null where the headline already says it. */
	detail: string | null;
	/** What a turn moved out of a rep does to the way home, when it was moved. */
	home: string | null;
}

/**
 * The marker's words. The marker is drawn after the step it refers to, so
 * "the step above" is always the right one.
 */
export function describeTurnaround(t: Turnaround): TurnaroundText {
	const fmt = (km: number) => formatTurnDistance(km, t.unit);
	const { point, extraKm } = t;
	const round = point.round ? ` in round ${point.round} of ${point.rounds}` : '';

	let detail: string | null;
	if (point.intoKm >= point.stepKm) {
		detail = `Once the step above is done${round}`;
	} else if (point.intoKm === point.atKm) {
		// Still in the first step, where the distance into it is the distance run.
		detail = null;
	} else {
		detail = `${fmt(point.intoKm)} into the step above${round}`;
	}

	let home: string | null = null;
	if (Math.abs(extraKm) >= SNAP_KM) {
		home =
			extraKm > 0
				? `Kept out of the rep: ${fmt(extraKm)} more to run home after the session`
				: `Kept out of the rep: ${fmt(-extraKm)} short of home when it ends`;
	}

	return { headline: `Turn around at ${fmt(point.atKm)}`, detail, home };
}
