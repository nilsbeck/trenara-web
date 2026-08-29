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
 * Six weeks is long enough to see through a single bad reading and short
 * enough that it reports what training is doing now, rather than averaging
 * this month's slide into the block's opening gains.
 */
export const TREND_WINDOW_DAYS = 42;

/**
 * The shortest span that can carry a direction.
 *
 * Predictions move in steps — a race-effort session can shift one overnight —
 * so a few days of readings describe one session, not a trend.
 */
export const TREND_MIN_DAYS = 14;

/** Two points are a line through whatever noise they happen to carry. */
export const TREND_MIN_SAMPLES = 3;

/**
 * How much weekly movement still counts as holding steady.
 *
 * Predicted pace is stored to the second, so a series that is genuinely flat
 * still wobbles by a second between readings; a band narrower than that would
 * report the rounding as a direction. Half a second per kilometre per week is
 * also below what a runner would notice over a block — a quarter of a minute
 * across a marathon in six weeks.
 */
export const TREND_FLAT_BAND_PER_WEEK = 0.5;

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

	// A series that stopped a month ago says nothing about this month.
	const cutoff = now.getTime() - TREND_WINDOW_DAYS * TREND_DAY_MS;
	if (points[points.length - 1].time < cutoff) return null;

	// Prefer the window; fall back to the last few readings when it is sparse,
	// rather than going quiet on a runner whose prediction simply moves rarely.
	const recent = points.filter((p) => p.time >= cutoff);
	const used = recent.length >= TREND_MIN_SAMPLES ? recent : points.slice(-TREND_MIN_SAMPLES);

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
