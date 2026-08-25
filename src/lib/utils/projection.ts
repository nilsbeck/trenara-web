const DAY_MS = 86_400_000;

/** Below this many samples, a line through them is a line through noise. */
export const MIN_SAMPLES = 6;

/** And below this span, six samples in one good week would set the slope. */
export const MIN_SPAN_DAYS = 21;

/**
 * How long improvement keeps arriving at its current rate before easing off.
 *
 * Fitness does not improve in a straight line — it plateaus — so a slope
 * extended unchanged overpromises the further out it goes. Gains approach a
 * ceiling on this time constant instead: over a few weeks it is barely
 * distinguishable from the straight line, and over a year it does not claim a
 * runner will keep improving at the rate they managed in March.
 */
const EASE_DAYS = 60;

export interface Sample {
	/** `YYYY-MM-DD`, as recorded. */
	date: string;
	/** The predicted time in seconds. */
	seconds: number;
}

export interface Trend {
	/** Seconds of predicted time gained per day. Negative is getting faster. */
	slopePerDay: number;
	/** The fitted value at a moment, in seconds. */
	at: (stamp: number) => number;
	firstStamp: number;
	lastStamp: number;
	samples: number;
}

/**
 * Least squares through the recorded predictions, against dates.
 *
 * Against dates, not sample positions: predictions are written only when they
 * change, so a burst of updates in one good week would otherwise weigh as much
 * as the quiet month around it.
 *
 * Null when there is not enough history to fit anything worth drawing.
 */
export function linearTrend(samples: Sample[]): Trend | null {
	const points = samples
		.map((s) => ({ stamp: new Date(s.date).getTime(), seconds: s.seconds }))
		.filter((p) => Number.isFinite(p.stamp) && Number.isFinite(p.seconds))
		.sort((a, b) => a.stamp - b.stamp);

	if (points.length < MIN_SAMPLES) return null;

	const firstStamp = points[0].stamp;
	const lastStamp = points[points.length - 1].stamp;
	if ((lastStamp - firstStamp) / DAY_MS < MIN_SPAN_DAYS) return null;

	const xs = points.map((p) => (p.stamp - firstStamp) / DAY_MS);
	const ys = points.map((p) => p.seconds);
	const n = xs.length;
	const meanX = xs.reduce((a, b) => a + b, 0) / n;
	const meanY = ys.reduce((a, b) => a + b, 0) / n;

	let numerator = 0;
	let denominator = 0;
	for (let i = 0; i < n; i++) {
		numerator += (xs[i] - meanX) * (ys[i] - meanY);
		denominator += (xs[i] - meanX) ** 2;
	}
	if (denominator === 0) return null;

	const slopePerDay = numerator / denominator;
	const intercept = meanY - slopePerDay * meanX;

	return {
		slopePerDay,
		at: (stamp: number) => intercept + slopePerDay * ((stamp - firstStamp) / DAY_MS),
		firstStamp,
		lastStamp,
		samples: n
	};
}

/**
 * The gain a slope is still expected to deliver over `days`.
 *
 * Straight-line for the first weeks, easing towards a ceiling after that —
 * see `EASE_DAYS`.
 */
export function easedGain(slopePerDay: number, days: number): number {
	return slopePerDay * EASE_DAYS * (1 - Math.exp(-days / EASE_DAYS));
}

export interface Projection {
	label: string;
	/** Two points: where the recorded history ends, and the target date. */
	points: Sample[];
	/** The projected value at the target date, in seconds. */
	endSeconds: number;
}

/**
 * Carry a trend forward to a date.
 *
 * `rate` scales the slope: 1 continues what the runner has actually been doing,
 * higher assumes they do more of the plan than they have been. Nothing here
 * knows whether that assumption is fair — it is the caller's to justify and to
 * label.
 */
export function project(
	trend: Trend,
	until: Date,
	{ label, rate = 1 }: { label: string; rate?: number }
): Projection | null {
	const untilStamp = until.getTime();
	if (!Number.isFinite(untilStamp) || untilStamp <= trend.lastStamp) return null;

	const days = (untilStamp - trend.lastStamp) / DAY_MS;
	const from = trend.at(trend.lastStamp);
	const endSeconds = from + easedGain(trend.slopePerDay * rate, days);

	const iso = (stamp: number) => new Date(stamp).toISOString().slice(0, 10);

	return {
		label,
		points: [
			{ date: iso(trend.lastStamp), seconds: from },
			{ date: iso(untilStamp), seconds: endSeconds }
		],
		endSeconds
	};
}

/**
 * How much faster the plan should go if it were followed as written.
 *
 * The observed trend was produced by the training that actually happened. When
 * that was a fraction of what the plan asked, completing the rest should
 * improve on it — but not in proportion, and this is the crudest part of the
 * whole projection: it assumes improvement scales with volume, which it does
 * only roughly and not at all past a point.
 *
 * So it is capped hard. A runner who did a third of their plan is not promised
 * three times the improvement.
 */
export function complianceRate(completedKm: number, plannedKm: number, cap = 1.5): number {
	if (!(plannedKm > 0) || !(completedKm > 0)) return 1;
	const ratio = plannedKm / completedKm;
	return Math.min(Math.max(ratio, 1), cap);
}
