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
