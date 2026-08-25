import { timeStringToSeconds, paceStringToSeconds } from './format';

/**
 * The exponent the API's own predictions follow.
 *
 * Every figure in a captured `best_times` block lies on one curve of the form
 * `T2 = T1 * (D2/D1)^e`: 5 km 19:29, 10 km 40:56, 15 km 1:03:12, half 1:31:04,
 * marathon 3:11:18 all agree at e = 1.0710–1.0713. So the block is not five
 * predictions but one fitness estimate rendered at five distances.
 *
 * Measured from one account, and taken as an argument everywhere rather than
 * buried in a formula, so a second capture can correct it in one place.
 */
export const RIEGEL_EXPONENT = 1.071;

/** Distances a stored prediction is likely to be about, in km. */
const STANDARD_DISTANCES = [
	1, 1.60934, 3, 5, 8, 10, 12, 15, 16.0934, 20, 21.0975, 25, 30, 42.195, 50, 80.4672, 100
];

/** A derived distance this close to a standard one is that distance. */
const SNAP_TOLERANCE = 0.015;

/**
 * The distance a stored prediction was about, in km.
 *
 * Nothing records it — but a time and a pace imply it, and the pair is stored.
 * Pace is kept to the whole second, so the quotient lands near the distance
 * rather than on it (a 15 km goal comes out at 15.048); a near-miss on a
 * distance anyone actually races is that distance.
 */
export function impliedDistanceKm(time: string, pace: string): number | null {
	const seconds = timeStringToSeconds(time);
	const perKm = paceStringToSeconds(pace);
	if (!Number.isFinite(seconds) || !Number.isFinite(perKm) || seconds <= 0 || perKm <= 0) {
		return null;
	}

	const raw = seconds / perKm;
	const standard = STANDARD_DISTANCES.find((d) => Math.abs(raw - d) / d <= SNAP_TOLERANCE);
	return standard ?? Math.round(raw * 10) / 10;
}

/**
 * The same fitness over a different distance, in seconds. `T2 = T1 * (D2/D1)^e`.
 */
export function equivalentSeconds(
	seconds: number,
	fromKm: number,
	toKm: number,
	exponent: number = RIEGEL_EXPONENT
): number {
	return seconds * Math.pow(toKm / fromKm, exponent);
}

export interface RaceEquivalent {
	/** Seconds over the reference distance. */
	seconds: number;
	/** Seconds per kilometre at that pace. */
	paceSeconds: number;
	/** The distance the stored prediction was about, in km. */
	fromKm: number;
}

/**
 * Rewrite a stored prediction as the equivalent over a reference distance.
 *
 * What makes a history comparable: the goal-distance prediction changes meaning
 * whenever the goal does, so a switch from a 15 km goal to a marathon reads as
 * a collapse in fitness. Converted to one distance, the series is a single
 * curve again.
 *
 * Returns null when the pair does not imply a usable distance — a malformed
 * row, or a pace of zero.
 */
export function raceEquivalent(
	time: string,
	pace: string,
	toKm = 10,
	exponent: number = RIEGEL_EXPONENT
): RaceEquivalent | null {
	const fromKm = impliedDistanceKm(time, pace);
	if (fromKm === null || fromKm <= 0) return null;

	const seconds = equivalentSeconds(timeStringToSeconds(time), fromKm, toKm, exponent);
	if (!Number.isFinite(seconds) || seconds <= 0) return null;

	return { seconds, paceSeconds: seconds / toKm, fromKm };
}
