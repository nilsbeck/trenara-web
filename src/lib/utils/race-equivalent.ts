import { timeStringToSeconds, paceStringToSeconds } from './format';

/**
 * A last-resort exponent, for a runner whose own is not knowable yet.
 *
 * Every figure in a captured `best_times` block lies on one curve of the form
 * `T2 = T1 * (D2/D1)^e`: 5 km 19:29, 10 km 40:56, 15 km 1:03:12, half 1:31:04,
 * marathon 3:11:18 all agree at e = 1.0710–1.0713. So the block is not five
 * predictions but one fitness estimate rendered at five distances.
 *
 * That measurement is from one account, and the exponent is the shape of a
 * runner's endurance — how much a doubled distance costs them — not a property
 * of the model, so there is no reason to expect another runner to share it.
 * `fitExponent` derives it from whatever predictions a given runner has, and
 * this is what remains when they have fewer than two: one prediction fixes a
 * level and says nothing about a slope. Every function here takes the exponent
 * as an argument rather than reaching for this, so using someone else's number
 * is a thing a caller has to choose.
 */
export const RIEGEL_EXPONENT = 1.071;

/** Distances a stored prediction is likely to be about, in km. */
const STANDARD_DISTANCES = [
	1, 1.60934, 3, 5, 8, 10, 12, 15, 16.0934, 20, 21.0975, 25, 30, 42.195, 50, 80.4672, 100
];

/** A derived distance this close to a standard one is that distance. */
const SNAP_TOLERANCE = 0.015;

/**
 * Everything else rounds to this, in km.
 *
 * The stored pace is a whole number of seconds, so the same goal divides out a
 * little differently from day to day — a real series read 41.06 one day and
 * 41.14 the next, flipping between 41.0 and 41.1 and moving the converted time
 * by six seconds for no reason at all. Half a kilometre is coarse enough to
 * hold one goal at one distance, and costs at most a fraction of a percent on a
 * goal that genuinely sits between the marks.
 */
const ROUND_TO_KM = 0.5;

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
	return standard ?? Math.round(raw / ROUND_TO_KM) * ROUND_TO_KM;
}

/**
 * The same fitness over a different distance, in seconds. `T2 = T1 * (D2/D1)^e`.
 */
export function equivalentSeconds(
	seconds: number,
	fromKm: number,
	toKm: number,
	exponent: number
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
 * The exponent is required rather than defaulted, and comes before the
 * reference distance for that reason: it belongs to the runner whose row this
 * is, and a default would quietly convert one runner's history on another
 * runner's endurance curve. `fitExponent` is where callers get it.
 *
 * Returns null when the pair does not imply a usable distance — a malformed
 * row, or a pace of zero.
 */
export function raceEquivalent(
	time: string,
	pace: string,
	exponent: number,
	toKm = 10
): RaceEquivalent | null {
	const fromKm = impliedDistanceKm(time, pace);
	if (fromKm === null || fromKm <= 0) return null;

	const seconds = equivalentSeconds(timeStringToSeconds(time), fromKm, toKm, exponent);
	if (!Number.isFinite(seconds) || seconds <= 0) return null;

	return { seconds, paceSeconds: seconds / toKm, fromKm };
}

/** A prediction from the API, as a distance and a time. */
export interface RacePoint {
	/** The distance predicted over, in km. */
	km: number;
	/** The predicted time, in seconds. */
	seconds: number;
}

/**
 * The points worth reading, in distance order and one per distance.
 *
 * A malformed time reaches here as a zero, and `ln 0` would take a whole curve
 * down with the one row that failed to parse.
 */
function usablePoints(points: RacePoint[]): RacePoint[] {
	return points
		.filter((p) => Number.isFinite(p.km) && Number.isFinite(p.seconds) && p.km > 0 && p.seconds > 0)
		.sort((a, b) => a.km - b.km)
		.filter((p, i, all) => i === 0 || p.km !== all[i - 1].km);
}

/**
 * A runner's prediction curve, `T = a * D^e`, as its two halves.
 *
 * They answer different questions and move on different timescales, which is
 * why both are worth keeping rather than one derived figure:
 *
 * `level` is where the curve sits — the runner's fitness on the day. It moves
 * week to week with training, and it is what a history chart is about.
 *
 * `exponent` is how steeply the curve rises — the shape of the runner's
 * endurance, how much a doubled distance costs them. A marathoner who holds
 * pace sits near 1.06 where someone quick over 5 km and fading sits above 1.08.
 * It moves over months, and it is what makes one runner's history
 * un-convertible on another's number.
 */
export interface RiegelCurve {
	/** `e`: how steeply time rises with distance. */
	exponent: number;
	/** `a`: seconds over one kilometre — the curve's height, at `D = 1`. */
	level: number;
}

/**
 * How far apart two distances must be before the slope between them is worth
 * reporting, as `ln(Dfar / Dnear)`.
 *
 * A two-point fit divides a time difference by a distance ratio, so a short
 * lever arm multiplies whatever error is in the distances. And the distances
 * are not exact: `impliedDistanceKm` rounds anything non-standard to the half
 * kilometre, which at 12 km is 2% — over a 10 km-to-12 km span that is 0.02 /
 * ln(1.2) = 0.11 of exponent, an answer wider than the entire range real
 * runners occupy. At this threshold (a ratio of about 1.28) the same 2% costs
 * 0.08, and by 10 km to half marathon it is 0.03. Below it there is no slope
 * here worth having, and the caller is better served by an exponent from
 * elsewhere.
 */
const MIN_LOG_SPAN = 0.25;

/**
 * The curve a runner's own predictions follow.
 *
 * `T = a * D^e` is a straight line in log-log, so this is an ordinary least
 * squares of `ln T` on `ln D`: the slope is the exponent, and the intercept is
 * `ln a`.
 *
 * All the points must come from one prediction set, taken on one day. Pooling
 * two days puts two different levels through one line and tilts the slope
 * between them.
 *
 * Returns null below two distinct distances, where there is no slope to
 * measure, and when the distances are too close together to measure one from —
 * see `MIN_LOG_SPAN`.
 */
export function fitCurve(points: RacePoint[]): RiegelCurve | null {
	const known = usablePoints(points);
	if (known.length < 2) return null;

	const lnD = known.map((p) => Math.log(p.km));
	const lnT = known.map((p) => Math.log(p.seconds));
	if (lnD[lnD.length - 1] - lnD[0] < MIN_LOG_SPAN) return null;

	const meanLnD = lnD.reduce((a, b) => a + b, 0) / known.length;
	const meanLnT = lnT.reduce((a, b) => a + b, 0) / known.length;

	let covariance = 0;
	let variance = 0;
	for (let i = 0; i < known.length; i++) {
		covariance += (lnD[i] - meanLnD) * (lnT[i] - meanLnT);
		variance += (lnD[i] - meanLnD) ** 2;
	}

	// Distinct distances are what `usablePoints` guarantees, so the variance is
	// positive; a non-finite slope would still mean there is nothing to report.
	const exponent = covariance / variance;
	const level = Math.exp(meanLnT - exponent * meanLnD);
	if (!Number.isFinite(exponent) || !Number.isFinite(level) || level <= 0) return null;

	return { exponent, level };
}

/**
 * The exponent a runner's own predictions follow.
 *
 * The endurance half of Riegel, and the half that is not the same for everyone.
 * Anywhere a prediction is converted for a particular runner, this is where the
 * exponent should come from — `RIEGEL_EXPONENT` is one account's answer and
 * belongs only to callers who have nothing else.
 *
 * The level is dropped here on purpose: a caller that wants both should ask
 * `fitCurve` for the pair rather than fit twice.
 */
export function fitExponent(points: RacePoint[]): number | null {
	return fitCurve(points)?.exponent ?? null;
}

/**
 * The curve through one point at a borrowed exponent.
 *
 * What is left for a row that states a single prediction: one point fixes a
 * level and says nothing about a slope, so the slope has to come from
 * somewhere else and the level follows from it exactly, `a = T / D^e`.
 *
 * The level this returns is still a measurement of the runner's fitness that
 * day — it is their own prediction re-expressed at one kilometre — but it is
 * only as right as the exponent handed in, so a caller that borrowed one
 * should record that it did.
 */
export function curveThrough(seconds: number, km: number, exponent: number): RiegelCurve | null {
	if (!Number.isFinite(seconds) || !Number.isFinite(km) || seconds <= 0 || km <= 0) return null;

	const level = seconds / Math.pow(km, exponent);
	return Number.isFinite(level) && level > 0 ? { exponent, level } : null;
}

/** What a curve predicts over a distance, in seconds. `T = a * D^e`. */
export function curveSeconds(curve: RiegelCurve, km: number): number {
	return curve.level * Math.pow(km, curve.exponent);
}

/**
 * Read a set of predictions at any distance, along the curve they already sit on.
 *
 * A `best_times` block is not five predictions but one fitness estimate rendered
 * five times — every figure in it lies on `T = a * D^e` — so it already answers
 * distances it never prints. This is what reads them back out.
 *
 * Riegel is applied between neighbouring points rather than fitted across all of
 * them at once, for one reason: a table and a slider that disagree are worse than
 * no slider, and a real block is not exactly on one curve. Its half marathon runs
 * a second off the exponent the other four agree on, and a least-squares fit
 * spreads that second around until the marathon reads 3:11:19 against the 3:11:18
 * printed directly above it. Interpolating within a segment reproduces every
 * stated prediction exactly and still travels on the account's own exponent —
 * measured locally, where it is being used, rather than averaged over distances
 * that are nowhere near.
 *
 * Outside the stated range the nearest segment's exponent carries on. That is
 * extrapolation and reads as such: the caller is the one that knows what the
 * range was, and should say so.
 *
 * A single point fixes only a level, so `fallbackExponent` supplies the slope.
 * Returns null when nothing usable is left — a malformed response, or a block of
 * unparseable times, which arrive here as zeroes.
 */
export function riegelCurve(
	points: RacePoint[],
	fallbackExponent: number = RIEGEL_EXPONENT
): ((km: number) => number) | null {
	const known = usablePoints(points);
	if (known.length === 0) return null;

	if (known.length === 1) {
		const [only] = known;
		return (km) => equivalentSeconds(only.seconds, only.km, km, fallbackExponent);
	}

	const exponents = known
		.slice(0, -1)
		.map(
			(from, i) =>
				Math.log(known[i + 1].seconds / from.seconds) / Math.log(known[i + 1].km / from.km)
		);

	return (km) => {
		let segment = exponents.length - 1;
		for (let i = 0; i < exponents.length; i++) {
			if (km <= known[i + 1].km) {
				segment = i;
				break;
			}
		}

		const from = known[segment];
		return equivalentSeconds(from.seconds, from.km, km, exponents[segment]);
	};
}
