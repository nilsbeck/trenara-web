import type { Sample } from './projection';

const DAY_MS = 86_400_000;

/** One week of training, and what the prediction did across it. */
export interface EarnWeek {
	startsOn: Date;
	/** What was actually done — kilometres, or load once that is available. */
	done: number;
	/** Predicted goal time at the start of the week, in seconds. */
	fromSeconds: number;
	/** And at the end of it. */
	toSeconds: number;
}

export interface EarnRate {
	/** Seconds off the prediction per unit of training done. Positive earns. */
	secondsPerUnit: number;
	/** How much of the week-to-week movement that rate explains, 0 to 1. */
	rSquared: number;
	weeks: number;
}

/**
 * What a unit of training has actually been worth to this runner.
 *
 * The rate the plan intends is a design document; this is the rate the runner's
 * own history shows. Fitted through the origin — a week with no training earns
 * nothing, which is the one point on this line we can be sure of — so it is
 * `sum(done * gain) / sum(done^2)` rather than a free-intercept regression that
 * would happily claim improvement out of rest.
 *
 * `rSquared` is the part worth reading before trusting the number: a prediction
 * that moves for reasons unrelated to volume will fit this badly, and a rate
 * fitted through noise is exactly the input that made the earlier projection
 * confident about nothing.
 *
 * Null when there is not enough to fit.
 */
export function earnRateFromHistory(weeks: EarnWeek[], minWeeks = 4): EarnRate | null {
	const usable = weeks.filter(
		(w) => Number.isFinite(w.done) && w.done >= 0 && Number.isFinite(w.fromSeconds)
	);
	if (usable.length < minWeeks) return null;

	let numerator = 0;
	let denominator = 0;
	for (const week of usable) {
		const gain = week.fromSeconds - week.toSeconds;
		numerator += week.done * gain;
		denominator += week.done ** 2;
	}
	if (denominator === 0) return null;

	const secondsPerUnit = numerator / denominator;

	let residual = 0;
	let total = 0;
	const meanGain =
		usable.reduce((sum, w) => sum + (w.fromSeconds - w.toSeconds), 0) / usable.length;
	for (const week of usable) {
		const gain = week.fromSeconds - week.toSeconds;
		residual += (gain - secondsPerUnit * week.done) ** 2;
		total += (gain - meanGain) ** 2;
	}

	return {
		secondsPerUnit,
		rSquared: total === 0 ? 0 : Math.max(0, 1 - residual / total),
		weeks: usable.length
	};
}

/** The predicted time on or before a date, from a recorded series. */
export function predictionAt(samples: Sample[], on: Date): number | null {
	const stamp = on.getTime();
	let best: Sample | null = null;

	for (const sample of samples) {
		const at = new Date(sample.date).getTime();
		if (!Number.isFinite(at) || at > stamp) continue;
		if (!best || at > new Date(best.date).getTime()) best = sample;
	}

	return best ? best.seconds : null;
}

export interface BacktestPoint {
	from: Date;
	to: Date;
	doneBetween: number;
	/** What the model said the prediction would be by `to`. */
	predictedSeconds: number;
	/** What it actually was. */
	actualSeconds: number;
	/** Model minus actual. Positive means the model was too pessimistic. */
	errorSeconds: number;
}

export interface Backtest {
	points: BacktestPoint[];
	meanAbsErrorSeconds: number;
	/** Mean signed error — whether the model leans optimistic or pessimistic. */
	biasSeconds: number;
	/**
	 * Mean absolute error of assuming the prediction simply does not move.
	 *
	 * The number the model has to beat. A model that cannot beat "nothing
	 * changes" is worse than no model, and this is the only way to find that out
	 * before shipping it.
	 */
	naiveMeanAbsErrorSeconds: number;
}

/**
 * Check a rate against what the prediction actually did.
 *
 * Walks the recorded history: from each week, apply the rate to the training
 * actually done over the following `horizonWeeks`, and compare where that says
 * the prediction should be against where it went. The comparison against doing
 * nothing is the point — a rate that predicts worse than "it stays where it is"
 * should not be drawn on anybody's chart.
 */
export function backtestEarnRate({
	samples,
	weeks,
	secondsPerUnit,
	horizonWeeks = 3
}: {
	samples: Sample[];
	weeks: { startsOn: Date; done: number }[];
	secondsPerUnit: number;
	horizonWeeks?: number;
}): Backtest | null {
	const points: BacktestPoint[] = [];

	// The window ends when the last week it counts ends. Reading the prediction a
	// week later would credit the rate with training the window never counted,
	// which flatters it by exactly one week's worth.
	for (let i = 0; i + horizonWeeks <= weeks.length; i++) {
		const from = weeks[i].startsOn;
		const to = new Date(weeks[i + horizonWeeks - 1].startsOn.getTime() + 6 * DAY_MS);

		const start = predictionAt(samples, from);
		const actual = predictionAt(samples, to);
		if (start === null || actual === null) continue;

		const doneBetween = weeks
			.slice(i, i + horizonWeeks)
			.reduce((sum, w) => sum + (Number.isFinite(w.done) ? w.done : 0), 0);

		const predicted = start - doneBetween * secondsPerUnit;
		points.push({
			from,
			to,
			doneBetween,
			predictedSeconds: predicted,
			actualSeconds: actual,
			errorSeconds: predicted - actual
		});
	}

	if (points.length === 0) return null;

	const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

	return {
		points,
		meanAbsErrorSeconds: mean(points.map((p) => Math.abs(p.errorSeconds))),
		biasSeconds: mean(points.map((p) => p.errorSeconds)),
		naiveMeanAbsErrorSeconds: mean(
			points.map((p) => Math.abs(predictionAt(samples, p.from)! - p.actualSeconds))
		)
	};
}
