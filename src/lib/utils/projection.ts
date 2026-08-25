const DAY_MS = 86_400_000;

/** Below this many samples, a line through them is a line through noise. */
export const MIN_SAMPLES = 6;

/** And below this span, six samples in one good week would set the slope. */
export const MIN_SPAN_DAYS = 21;

/**
 * How much of the movement the line has to explain to be worth drawing.
 *
 * Enough history is not the same as a trend. A prediction that wanders around
 * one value for three months fits a flat line perfectly well, and drawing it
 * invents a direction the data never had — which is worse than drawing
 * nothing, because it looks like a finding.
 */
export const MIN_FIT = 0.25;

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
	/** The last value actually recorded — where a projection should start from. */
	lastSeconds: number;
	samples: number;
	/**
	 * How much of the movement the line explains, 0 to 1.
	 *
	 * Near zero on a series that wanders without going anywhere, which is
	 * exactly when a projection would be reading a direction into noise.
	 */
	rSquared: number;
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
	const fitted = (x: number) => intercept + slopePerDay * x;

	let residual = 0;
	let total = 0;
	for (let i = 0; i < n; i++) {
		residual += (ys[i] - fitted(xs[i])) ** 2;
		total += (ys[i] - meanY) ** 2;
	}

	return {
		slopePerDay,
		at: (stamp: number) => fitted((stamp - firstStamp) / DAY_MS),
		firstStamp,
		lastStamp,
		lastSeconds: points[points.length - 1].seconds,
		samples: n,
		rSquared: total === 0 ? 0 : Math.max(0, 1 - residual / total)
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
	// From the last value actually recorded, not the fitted one: a dashed line
	// that starts a few pixels off the end of the solid one reads as a mistake,
	// whatever it is doing arithmetically.
	const from = trend.lastSeconds;
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

/** One week of the plan, and what following it is asking for. */
export interface PlanStep {
	/** Monday of the week. */
	startsOn: Date;
	plannedKm: number;
	/** Seconds off the goal-distance prediction this week is asked to buy. */
	gainSeconds: number;
	/** The same, per kilometre — the number a runner actually reads. */
	gainPaceSeconds: number;
	/** Where the prediction stands once this week has been done. */
	endSeconds: number;
}

export interface PlanTrajectory {
	steps: PlanStep[];
	/** Two or more points for drawing: today, then each week's end. */
	points: Sample[];
	/** Seconds of improvement the remaining plan earns in total. */
	totalGainSeconds: number;
	/** Where that leaves the prediction on race day. */
	endSeconds: number;
	/**
	 * How far short of the goal that lands, in seconds. Positive means the
	 * remaining work cannot close the gap — the cost of the weeks already lost,
	 * which no amount of training left can undo.
	 */
	shortfallSeconds: number;
}

/**
 * What the plan earns per kilometre, from its own design.
 *
 * A plan is built to carry a runner from where they were at the start to their
 * goal by race day, using the volume it prescribes. So the improvement it
 * intends per kilometre is the gap it set out to close, divided by the whole
 * distance it asked for — read off this plan rather than assumed from a
 * textbook.
 *
 * Null when the goal was already in reach at the start, when there is nothing
 * to earn.
 */
export function planEarnRate(gapAtStartSeconds: number, totalPlannedKm: number): number | null {
	if (!(gapAtStartSeconds > 0) || !(totalPlannedKm > 0)) return null;
	return gapAtStartSeconds / totalPlannedKm;
}

/**
 * What following the rest of the plan is worth, week by week.
 *
 * Not a forecast of a body, and not a promise about the goal: the training
 * still ahead earns what the plan earns per kilometre, and that is all it
 * earns. A week that was missed took its kilometres with it, so the line ends
 * wherever the remaining work can reach — short of the goal when weeks were
 * lost, which is the honest shape. Nothing here can make up for time missed,
 * and a line that closed the gap anyway would be claiming otherwise.
 *
 * Spread by planned distance, because the weeks are not equal: a 56 km week
 * earns more than a 37 km one, and that is what makes the numbers worth
 * reading rather than an average nobody trains at.
 *
 * The last week earns nothing. Fitness from a session takes ten days or so to
 * arrive, so work in race week changes how fresh a runner is, not how fast —
 * and a line that promised otherwise would be telling them to train through
 * the taper.
 *
 * Volume only: a session done at half the prescribed intensity counts here as
 * a session done, because kilometres are what the series records.
 */
export function planTrajectory({
	from,
	fromDate,
	goalSeconds,
	weeks,
	distanceKm,
	secondsPerKm
}: {
	/** Today's predicted time in seconds. */
	from: number;
	fromDate: Date;
	goalSeconds: number;
	/** Remaining weeks of the plan, in order, Monday-dated. */
	weeks: { startsOn: Date; plannedKm: number }[];
	distanceKm: number;
	/** What a kilometre of this plan is worth — see `planEarnRate`. */
	secondsPerKm: number;
}): PlanTrajectory | null {
	if (!(distanceKm > 0) || !(secondsPerKm > 0)) return null;

	// Everything but the last week, which arrives too late to count.
	const earning = weeks.slice(0, -1).filter((w) => w.plannedKm > 0);
	if (earning.length === 0) return null;

	let standing = from;
	const steps: PlanStep[] = earning.map((week) => {
		const gainSeconds = week.plannedKm * secondsPerKm;
		standing -= gainSeconds;
		return {
			startsOn: week.startsOn,
			plannedKm: week.plannedKm,
			gainSeconds,
			gainPaceSeconds: gainSeconds / distanceKm,
			endSeconds: standing
		};
	});

	const iso = (d: Date) => d.toISOString().slice(0, 10);
	const weekEnd = (d: Date) => new Date(d.getTime() + 6 * DAY_MS);

	return {
		steps,
		points: [
			{ date: iso(fromDate), seconds: from },
			...steps.map((step) => ({ date: iso(weekEnd(step.startsOn)), seconds: step.endSeconds }))
		],
		totalGainSeconds: from - standing,
		endSeconds: standing,
		/** Positive when the remaining work cannot close the gap — weeks were lost. */
		shortfallSeconds: standing - goalSeconds
	};
}
