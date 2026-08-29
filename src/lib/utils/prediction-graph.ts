/** The two numbers every prediction point carries. */
export interface PredictionPoint {
	predictedTime: number;
	predictedPace: number;
}

/**
 * How many seconds of pace there are per second of predicted time.
 *
 * Pace *is* the time, divided by the distance — for a fixed distance the two
 * series are exactly proportional, which is why plotting both was drawing one
 * trend twice and calling it two. One line and one scale is the honest chart;
 * this ratio is what lets the same gridline be labelled in both units, the way
 * a thermometer carries °C and °F.
 *
 * Returns null when the ratio is not consistent across the series — a history
 * spanning goals of different distances, or a bad record — because a single
 * conversion would then be wrong for most of the points. Callers drop the pace
 * axis in that case rather than printing a number they cannot stand behind.
 */
export function paceRatio(points: PredictionPoint[], tolerance = 0.02): number | null {
	const ratios = points
		.filter((p) => p.predictedTime > 0 && p.predictedPace > 0)
		.map((p) => p.predictedPace / p.predictedTime);

	if (ratios.length === 0) return null;

	const min = Math.min(...ratios);
	const max = Math.max(...ratios);
	// Rounding in the stored strings moves the ratio a little; a real change of
	// distance moves it a lot. The tolerance sits between the two.
	if (min <= 0 || (max - min) / min > tolerance) return null;

	return ratios.reduce((sum, r) => sum + r, 0) / ratios.length;
}

/** Where the prediction stands now, and how far it has moved. */
export interface PredictionSummary {
	latest: PredictionPoint & { formattedTime: string; formattedPace: string };
	/**
	 * Seconds knocked off the first prediction in the series. Positive is
	 * faster — the direction people mean by "improvement", which the raw times
	 * get backwards.
	 */
	gainedSeconds: number;
	/** False for a single point, where there is nothing to have moved from. */
	hasTrend: boolean;
}

export function summarise<
	T extends PredictionPoint & { formattedTime: string; formattedPace: string }
>(points: T[]): PredictionSummary | null {
	if (points.length === 0) return null;
	const first = points[0];
	const latest = points[points.length - 1];
	return {
		latest,
		gainedSeconds: first.predictedTime - latest.predictedTime,
		hasTrend: points.length > 1
	};
}

/** `2:14` / `1:03:20` — a duration, without a leading zero hour. */
export function formatDelta(seconds: number): string {
	const total = Math.round(Math.abs(seconds));
	const h = Math.floor(total / 3600);
	const m = Math.floor((total % 3600) / 60);
	const s = total % 60;
	return h > 0
		? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
		: `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Which way the pace curve is going.
 *
 * `improving` is a falling curve — the predicted pace is getting faster.
 * `detraining` is a rising one. `maintaining` is the band between them, which
 * exists because a curve that is flat to within a rounding error is not a
 * direction and should not be reported as one.
 */
export type TrendDirection = 'improving' | 'maintaining' | 'detraining';

export interface PaceTrend {
	direction: TrendDirection;
	/**
	 * Seconds per kilometre the predicted pace moves in a week, from a
	 * least-squares fit through the window. Negative is getting faster.
	 */
	perWeekSeconds: number;
	/** Days between the first and last reading the fit used. */
	days: number;
	/** How many readings it used. */
	samples: number;
}

/**
 * How far back the trend looks.
 *
 * A goal block is twelve weeks or shorter, so anything measured in months is
 * measuring the block rather than the training. A fortnight is the span the
 * question is actually about — am I improving *now*, with the race still to
 * come — and it is short enough to still have an answer in a block's opening
 * weeks, when a longer window would have nothing to read.
 */
export const TREND_WINDOW_DAYS = 14;

/**
 * How far back the sparse case may reach.
 *
 * A record is only written when the prediction moves, so a quiet fortnight —
 * a taper, a week off, a runner whose prediction shifts twice a month — can
 * hold too few readings to fit anything. Reaching a little further keeps the
 * badge from vanishing on exactly the runners it has something to tell, and
 * the cap is what stops that reach from quietly turning into a verdict on the
 * whole block.
 */
export const TREND_REACH_DAYS = 28;

/**
 * The shortest span that can carry a direction.
 *
 * Predictions move in steps — a race-effort session can shift one overnight —
 * so a few days of readings describe that session, not a trend. Ten days is
 * also what keeps the stored rounding from dominating the fit: see the band
 * below.
 */
export const TREND_MIN_DAYS = 10;

/** Two points are a line through whatever noise they happen to carry. */
export const TREND_MIN_SAMPLES = 3;

/**
 * How much weekly movement still counts as holding steady.
 *
 * Predicted pace is stored to the second, so a genuinely flat series still
 * ticks by a whole second between readings. Over a fortnight that single tick
 * fits as roughly 0.5s/km per week, and over the ten-day floor as roughly
 * 0.7 — which is why this band is wider than it would need to be over six
 * weeks. Below it, the line is reading the rounding.
 *
 * A block that takes 20-30s/km off a marathon pace is moving at about
 * 2s/km per week, so real training still clears this comfortably.
 */
export const TREND_FLAT_BAND_PER_WEEK = 1;

/** A recorded pace, as of a date. */
export interface PaceReading {
	/** Anything `Date` parses — the stored `recorded_at`, in practice. */
	date: string;
	/** Predicted pace in seconds per kilometre. */
	predictedPace: number;
}

const TREND_DAY_MS = 86_400_000;

/**
 * Which way the recorded pace curve has been going lately.
 *
 * Fitted rather than read off the endpoints: predictions are only written when
 * they change, so the first and last readings in a window are as likely to be
 * two jumps as a trend, and a straight subtraction hands the whole verdict to
 * whichever session happened to land on the edge of the window.
 *
 * Null when there is nothing worth calling a direction — too few readings, too
 * short a span, or a series that stops well before today and so describes a
 * runner who is no longer being measured rather than one who is detraining.
 */
export function paceTrend(readings: PaceReading[], now = new Date()): PaceTrend | null {
	const points = readings
		.map((r) => ({ time: new Date(r.date).getTime(), pace: r.predictedPace }))
		.filter((p) => Number.isFinite(p.time) && p.pace > 0)
		.sort((a, b) => a.time - b.time);

	if (points.length < TREND_MIN_SAMPLES) return null;

	// A series that stopped a fortnight ago describes a runner who is no longer
	// being measured, which is not the same thing as one losing fitness.
	const cutoff = now.getTime() - TREND_WINDOW_DAYS * TREND_DAY_MS;
	if (points[points.length - 1].time < cutoff) return null;

	// The fortnight is the answer wherever it holds enough readings. Where it
	// does not, reach back as far as the cap and no further — a bounded stretch
	// keeps a sparse fortnight readable without letting "lately" become "this
	// block".
	const recent = points.filter((p) => p.time >= cutoff);
	const reach = now.getTime() - TREND_REACH_DAYS * TREND_DAY_MS;
	const used = recent.length >= TREND_MIN_SAMPLES ? recent : points.filter((p) => p.time >= reach);

	if (used.length < TREND_MIN_SAMPLES) return null;

	const days = (used[used.length - 1].time - used[0].time) / TREND_DAY_MS;
	if (days < TREND_MIN_DAYS) return null;

	// Least squares through (days since the first reading, pace).
	const origin = used[0].time;
	const xs = used.map((p) => (p.time - origin) / TREND_DAY_MS);
	const meanX = xs.reduce((sum, x) => sum + x, 0) / xs.length;
	const meanY = used.reduce((sum, p) => sum + p.pace, 0) / used.length;

	let covariance = 0;
	let variance = 0;
	for (const [i, x] of xs.entries()) {
		covariance += (x - meanX) * (used[i].pace - meanY);
		variance += (x - meanX) ** 2;
	}
	if (variance === 0) return null;

	const perWeekSeconds = (covariance / variance) * 7;
	const direction: TrendDirection =
		perWeekSeconds <= -TREND_FLAT_BAND_PER_WEEK
			? 'improving'
			: perWeekSeconds >= TREND_FLAT_BAND_PER_WEEK
				? 'detraining'
				: 'maintaining';

	return { direction, perWeekSeconds, days: Math.round(days), samples: used.length };
}
