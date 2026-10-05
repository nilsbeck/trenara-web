import { toLocalDateString } from './date';

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

/** A predicted time, as recorded on a date. */
export interface Sample {
	/** `YYYY-MM-DD`, as recorded. */
	date: string;
	/** The predicted time in seconds. */
	seconds: number;
}

/**
 * How long before race day a kilometre stops buying speed.
 *
 * Fitness from a session arrives about ten days later, so work inside this
 * window changes how fresh a runner is, not how fast. Volume there is dropped
 * rather than credited — a line that counted race week would be telling
 * somebody to train through their taper.
 *
 * Applied as a date cutoff rather than by dropping the last row, because a
 * plan's final week is not reliably seven days long and the taper is not
 * reliably one week.
 */
export const FITNESS_LAG_DAYS = 10;

/** Below this many observation intervals, the runner's own rate is guesswork. */
export const MIN_INTERVALS = 4;

/**
 * How much of the plan must lie between the anchor and today for the plan's
 * design rate to say anything.
 *
 * The plan rate is calibrated so that a runner who has kept pace since the
 * anchor lands exactly on the goal — that is what makes a shortfall meaningful
 * when they have not. But it also means an anchor set a few days ago has had no
 * room to detect anything: the runner cannot have fallen behind a rate that was
 * measured from where they already are, so the line would report "on target"
 * whatever they had been doing. Not enough plan behind the anchor is not a
 * forecast worth drawing.
 */
export const MIN_ANCHOR_SHARE = 0.15;

/**
 * And below this fit, the intervals are not describing a rate at all.
 *
 * Measured uncentered — see `observedRate` — so it is not directly comparable
 * to the centred R² of an ordinary regression.
 */
export const MIN_RATE_FIT = 0.5;

/** A week of the plan reduced to what this module needs: when, and how far. */
export interface VolumeWeek {
	startsOn: Date;
	km: number;
}

/**
 * Kilometres falling inside `[from, to)`, spread evenly across each week.
 *
 * Weeks are the finest grain the goal series carries, so a week is treated as
 * seven equal days. That is what lets every partial window — today's half-done
 * week, the days before the fitness cutoff — be priced the same way instead of
 * each getting its own special case.
 */
export function volumeBetween(weeks: VolumeWeek[], from: Date, to: Date): number {
	const start = from.getTime();
	const end = to.getTime();
	if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;

	let total = 0;
	for (const week of weeks) {
		const ws = week.startsOn.getTime();
		if (!Number.isFinite(ws) || !(week.km > 0)) continue;
		const lo = Math.max(ws, start);
		const hi = Math.min(ws + WEEK_MS, end);
		if (hi <= lo) continue;
		total += week.km * ((hi - lo) / WEEK_MS);
	}
	return total;
}

/** The last day on which training still changes race-day fitness. */
export function earnCutoff(raceDay: Date): Date {
	return new Date(raceDay.getTime() - FITNESS_LAG_DAYS * DAY_MS);
}

export interface RateEstimate {
	/** Seconds off the prediction per kilometre. Positive earns. */
	secondsPerKm: number;
	/**
	 * Where the number came from.
	 *
	 * `observed` is what a kilometre has actually been worth to this runner;
	 * `plan` is what the plan's own design intends one to be worth, used when
	 * there is not enough history to measure.
	 */
	source: 'observed' | 'plan';
	/** Observation intervals behind an observed rate. */
	intervals?: number;
	/** How much of the movement those intervals explain, 0 to 1. */
	rSquared?: number;
}

/**
 * Why a runner's own rate was not used, when it was not.
 *
 * The forecast used to say "not enough history" for all of these, which was
 * true of only the first. A runner reading "not enough history" three weeks
 * into a block with a reading on most days reasonably concludes the app is
 * broken; one reading "your readings so far show no net gain per km" knows
 * what it is waiting for.
 */
export type RateRejection =
	| {
			/** Fewer readings than `MIN_INTERVALS` gaps need. */
			reason: 'few-readings';
			readings: number;
			needed: number;
	  }
	/** No kilometres were run between any two readings, so there is nothing to divide by. */
	| { reason: 'no-volume' }
	/** The fitted rate is zero or says the runner has been getting slower. */
	| { reason: 'not-improving' }
	/** The readings move, but not with the kilometres. */
	| { reason: 'poor-fit'; rSquared: number };

/** `observedRate`, or why there is none. */
export function measureRate(samples: Sample[], done: VolumeWeek[]): RateEstimate | RateRejection {
	const points = samples
		.map((s) => ({ stamp: new Date(s.date).getTime(), seconds: s.seconds }))
		.filter((p) => Number.isFinite(p.stamp) && Number.isFinite(p.seconds))
		.sort((a, b) => a.stamp - b.stamp);

	const intervals: { km: number; gain: number }[] = [];
	for (let i = 0; i + 1 < points.length; i++) {
		const km = volumeBetween(done, new Date(points[i].stamp), new Date(points[i + 1].stamp));
		// A stretch with no training kept, not dropped. It contributes nothing to
		// the rate itself — no kilometres to weigh — but it is the sharpest test
		// this fit has: the model says an untrained fortnight earns nothing, and
		// an untrained fortnight that moved the prediction anyway is evidence
		// against the whole idea that volume is what moves it. Dropping those
		// intervals would quietly delete every observation the model can fail.
		if (!Number.isFinite(km) || km < 0) continue;
		intervals.push({ km, gain: points[i].seconds - points[i + 1].seconds });
	}

	if (intervals.length < MIN_INTERVALS) {
		return { reason: 'few-readings', readings: points.length, needed: MIN_INTERVALS + 1 };
	}

	let numerator = 0;
	let denominator = 0;
	for (const step of intervals) {
		numerator += step.km * step.gain;
		denominator += step.km ** 2;
	}
	if (denominator === 0) return { reason: 'no-volume' };

	const secondsPerKm = numerator / denominator;
	// A rate at or below zero says this runner has been getting slower. That may
	// well be true, but it is not something to extend to race day as a forecast:
	// fall back to what the plan intends instead of drawing a line that promises
	// decline.
	if (!(secondsPerKm > 0)) return { reason: 'not-improving' };

	// Uncentered, because the fit is through the origin. Measuring against the
	// mean gain asks how much better the rate is than "every interval earned the
	// same", which is a model nobody proposed — and it collapses exactly where
	// the rate is most trustworthy: a runner improving at a perfectly steady
	// rate has no variance about the mean, and a centred R² scores that
	// flawless fit as zero. Against the origin, a steady earner scores 1 and a
	// series that ignores volume scores about 0, which is the question worth
	// asking.
	let residual = 0;
	let total = 0;
	for (const step of intervals) {
		residual += (step.gain - secondsPerKm * step.km) ** 2;
		total += step.gain ** 2;
	}
	const rSquared = total === 0 ? 0 : Math.max(0, 1 - residual / total);
	if (rSquared < MIN_RATE_FIT) return { reason: 'poor-fit', rSquared };

	return { secondsPerKm, source: 'observed', intervals: intervals.length, rSquared };
}

function isRate(result: RateEstimate | RateRejection): result is RateEstimate {
	return 'secondsPerKm' in result;
}

/**
 * What a kilometre has actually been worth to this runner.
 *
 * Fitted across the gaps between consecutive recorded predictions rather than
 * across fixed weeks. Predictions are only written when they change, so a week
 * with no record is not a week with no progress — scoring fixed weeks against a
 * sparse series scores most of them as zero gain and drags the rate to nothing.
 * The gaps between real observations are the only intervals we actually
 * measured.
 *
 * Fitted through the origin: no training earns no improvement, which is the one
 * point on this line we can be sure of.
 *
 * Null when there is not enough to fit, or when the fit is too poor to be worth
 * preferring over the plan's own design rate; `measureRate` says which.
 */
export function observedRate(samples: Sample[], done: VolumeWeek[]): RateEstimate | null {
	const result = measureRate(samples, done);
	return isRate(result) ? result : null;
}

/**
 * What the plan's own design says a kilometre is worth.
 *
 * The plan exists to close a gap using the volume it prescribes, so the rate it
 * intends is the gap over that volume. Anchored at the earliest prediction on
 * record rather than at the goal's start date: the two are the same thing when
 * recording began with the goal, and when it began later, the gap still
 * standing at that point over the volume still to come is the same arithmetic
 * on a shorter plan. Anchoring at the goal's start and dividing by the whole
 * plan would price a gap we never saw against volume already spent.
 *
 * Null when the goal was already in reach at the anchor, and when the anchor is
 * too recent to have detected anything — see `MIN_ANCHOR_SHARE`.
 */
export function planRate({
	anchorSeconds,
	anchorDate,
	goalSeconds,
	planned,
	cutoff,
	now
}: {
	anchorSeconds: number;
	anchorDate: Date;
	goalSeconds: number;
	planned: VolumeWeek[];
	cutoff: Date;
	now: Date;
}): RateEstimate | null {
	const gap = anchorSeconds - goalSeconds;
	if (!(gap > 0)) return null;
	const volume = volumeBetween(planned, anchorDate, cutoff);
	if (!(volume > 0)) return null;
	if (volumeBetween(planned, anchorDate, now) / volume < MIN_ANCHOR_SHARE) return null;
	return { secondsPerKm: gap / volume, source: 'plan' };
}

/**
 * What a point on the forecast line is standing on.
 *
 * The seconds alone say where the line goes; these say why it goes there. A
 * projection that bends is only worth drawing if the reader can find out what
 * bent it, and the answer is always kilometres — the ones in this stretch, and
 * the ones behind it since today.
 */
export interface ForecastPoint extends Sample {
	/** Plan kilometres between today and here that still change race-day fitness. */
	kmToDate: number;
	/** Kilometres in the stretch ending here — the load this segment was earned on. */
	segmentKm: number;
	/**
	 * What the point marks.
	 *
	 * `cutoff` is the last day training still buys speed and `race` is race day
	 * itself; the flat run between them is the taper, not a stalled forecast,
	 * and naming both ends is what lets a caller say so.
	 */
	kind: 'today' | 'week' | 'cutoff' | 'race';
}

/**
 * A stretch of the plan that still earns, and what it asks for.
 *
 * Weeks clipped to the window between today and the fitness cutoff, so a
 * half-run week and a week cut short by the taper are each priced at the part
 * that still counts. This is the volume the forecast line is drawn from, handed
 * back so it can be drawn beside it rather than inferred from the slope.
 */
export interface LoadSlice {
	from: Date;
	to: Date;
	km: number;
}

export interface Forecast {
	/** Where the prediction lands on race day, in seconds. */
	endSeconds: number;
	/**
	 * How far short of the goal that is, in seconds.
	 *
	 * Positive means the training still left cannot close the gap: the weeks
	 * already gone took their kilometres with them, and no amount of work
	 * remaining can run them again. Never negative while today's own prediction
	 * is behind the goal — see `gainSeconds` — so a goal that is still out of
	 * reach today cannot be forecast as beaten.
	 */
	shortfallSeconds: number;
	/**
	 * Seconds the remaining plan is worth, capped at what is left to find.
	 *
	 * The fitted rate times the remaining kilometres, unless that outruns the
	 * gap between today's prediction and the goal — closing more than the whole
	 * gap is closing a gap that is not there, so the remaining plan is never
	 * credited with more than the gap actually is. Only capped while a gap
	 * remains: a prediction already at or past the goal has nothing left to cap
	 * against.
	 */
	gainSeconds: number;
	/** Kilometres left that still change race-day fitness. */
	remainingKm: number;
	/** Kilometres the plan asked for up to today. */
	askedToDateKm: number;
	/** And how many were actually run. */
	doneToDateKm: number;
	rate: RateEstimate;
	/** Why the runner's own rate was passed over, when `rate` is the plan's. */
	rejected: RateRejection | null;
	/** Where the last couple of weeks lead if they carry on, or why that cannot be said; see `recentTrend`. */
	recent: RecentTrend | RecentTrendGap;
	/** Points for drawing: today, then each week boundary, then race day. */
	points: ForecastPoint[];
	/** The weekly volume those points were priced from, for drawing beside them. */
	load: LoadSlice[];
}

/**
 * Where this runner lands on race day if the rest of the plan is followed.
 *
 * Everything already done or missed is in `nowSeconds` — that is the coach's
 * own prediction, and it has already absorbed every session run and skipped.
 * What this adds is the other half: the volume still ahead, priced at what a
 * kilometre is worth to this runner, stopping where training stops mattering.
 *
 * So a missed week costs twice, correctly and without being counted twice: its
 * training never moved the prediction, and its kilometres are not in the
 * remaining volume either. A line that still reached the goal after weeks were
 * lost would be claiming those weeks back.
 */
export function forecast({
	nowSeconds,
	now,
	goalSeconds,
	raceDay,
	planned,
	done,
	samples,
	goalStart
}: {
	nowSeconds: number;
	now: Date;
	goalSeconds: number;
	raceDay: Date;
	planned: VolumeWeek[];
	done: VolumeWeek[];
	samples: Sample[];
	goalStart: Date;
}): Forecast | null {
	if (!Number.isFinite(nowSeconds) || !Number.isFinite(goalSeconds)) return null;

	// An Invalid Date compares false against everything, so `cutoff <= now`
	// waves one through and every sum after it comes out NaN.
	const cutoff = earnCutoff(raceDay);
	if (!Number.isFinite(cutoff.getTime()) || cutoff <= now) return null;

	const ordered = samples
		.map((s) => ({ stamp: new Date(s.date).getTime(), seconds: s.seconds }))
		.filter((p) => Number.isFinite(p.stamp) && Number.isFinite(p.seconds))
		.sort((a, b) => a.stamp - b.stamp);

	const anchor = ordered[0];
	const measured = measureRate(samples, done);
	const rate =
		(isRate(measured) ? measured : null) ??
		(anchor
			? planRate({
					anchorSeconds: anchor.seconds,
					anchorDate: new Date(anchor.stamp),
					goalSeconds,
					planned,
					cutoff,
					now
				})
			: null);
	if (!rate) return null;

	const remainingKm = volumeBetween(planned, now, cutoff);
	if (!(remainingKm > 0)) return null;

	const { secondsPerKm } = rate;
	const uncappedGainSeconds = remainingKm * secondsPerKm;

	// The remaining plan cannot buy back more than the runner is currently
	// short by — closing more than the whole gap is closing a gap that is not
	// there. Left uncapped, a rate fitted early or from a small sample (see
	// MIN_INTERVALS, MIN_ANCHOR_SHARE) can extrapolate a training block into
	// promising a finish faster than the goal itself, which is not a forecast
	// worth reading as realistic. Only checked while a gap remains: a runner
	// already ahead of goal is reading their own earned prediction, not a
	// promise about training still to come, so nothing here caps how far
	// ahead of goal that already is.
	const currentGap = nowSeconds - goalSeconds;
	const gainSeconds =
		currentGap > 0 ? Math.min(uncappedGainSeconds, currentGap) : uncappedGainSeconds;
	const endSeconds = nowSeconds - gainSeconds;

	// The line has to be drawn at the same rate the cap actually applied, not
	// the fitted one — otherwise a capped race-day point lands short of where
	// the cutoff point (still drawn at the uncapped rate) already put it, and
	// the flat taper between them runs backwards. Scaling the rate down keeps
	// every vertex on one straight line into the same, capped endpoint.
	const drawnRate =
		uncappedGainSeconds > 0 ? secondsPerKm * (gainSeconds / uncappedGainSeconds) : secondsPerKm;

	// A point at every week boundary, so the line bends where the volume does —
	// flattening through the taper instead of running straight at the goal.
	//
	// The boundaries are the only vertices there are: a week's kilometres are
	// spread evenly across its seven days, so the line is straight *within* a
	// week by construction and can only change slope where one week hands over
	// to the next. Points in between would be collinear padding.
	const points: ForecastPoint[] = [
		{ date: toLocalDateString(now), seconds: nowSeconds, kmToDate: 0, segmentKm: 0, kind: 'today' }
	];

	function at(when: Date, kind: ForecastPoint['kind']): void {
		const kmToDate = volumeBetween(planned, now, when);
		points.push({
			date: toLocalDateString(when),
			seconds: nowSeconds - kmToDate * drawnRate,
			kmToDate,
			segmentKm: kmToDate - points[points.length - 1].kmToDate,
			kind
		});
	}

	for (const week of planned) {
		const boundary = new Date(week.startsOn.getTime() + WEEK_MS);
		if (boundary <= now || boundary >= cutoff) continue;
		at(boundary, 'week');
	}
	at(cutoff, 'cutoff');
	// Race day itself, held flat across the lag window: nothing in it earns, so
	// the kilometres it is standing on are the cutoff's, not its own.
	points.push({
		date: toLocalDateString(raceDay),
		seconds: endSeconds,
		kmToDate: remainingKm,
		segmentKm: 0,
		kind: 'race'
	});

	return {
		endSeconds,
		shortfallSeconds: endSeconds - goalSeconds,
		gainSeconds,
		remainingKm,
		askedToDateKm: volumeBetween(planned, goalStart, now),
		doneToDateKm: volumeBetween(done, goalStart, now),
		rate,
		rejected: isRate(measured) ? null : measured,
		recent: recentTrend({ nowSeconds, now, goalSeconds, samples, done, remainingKm }),
		points,
		load: loadSlices(planned, now, cutoff)
	};
}

/** How far back the recent trend looks. */
export const RECENT_WINDOW_DAYS = 14;

/** Below this many days of readings, a "recent trend" is one session's verdict. */
export const MIN_RECENT_DAYS = 7;

/** What the last fortnight of readings says about race day. */
export interface RecentTrend {
	/** Days of history the trend is measured over. */
	days: number;
	/** Seconds the prediction moved over those days. Positive is faster. */
	gainSeconds: number;
	/** Kilometres run over them. */
	km: number;
	/** `gainSeconds / km`; zero or below when the prediction has not improved. */
	secondsPerKm: number;
	/** Race-day prediction if the remaining plan earns at that rate. */
	endSeconds: number;
	/** True when the rate would have carried the prediction past the goal. */
	capped: boolean;
}

/**
 * Why there is no recent trend to show.
 *
 * Said on screen rather than leaving the row out: a row that is simply absent
 * cannot be told apart from one that was never built, and the runner who first
 * missed it had no way to say which of these it was.
 */
export type RecentTrendGap =
	| { reason: 'no-readings' }
	/** The readings for this goal reach back fewer than `MIN_RECENT_DAYS`. */
	| { reason: 'few-days'; days: number; needed: number }
	/** Nothing logged as run in the window, so there is nothing to divide by. */
	| { reason: 'no-km'; days: number };

export function isRecentTrend(recent: RecentTrend | RecentTrendGap): recent is RecentTrend {
	return 'endSeconds' in recent;
}

/**
 * The second opinion beside the forecast: what the last fortnight is worth.
 *
 * The forecast's rate is fitted across the whole goal, or is the plan's own
 * when that fit fails — and either way a runner whose prediction has turned a
 * corner sees a line far flatter than the curve they are actually on. A
 * recalibration followed by a fortnight of steady gains is the case that
 * prompted this: the plan rate read as the app not noticing. This does not
 * replace the forecast, because a fortnight is also exactly long enough to be
 * the model catching up with fitness already there, which does not continue;
 * it sits beside it so the two together read as a range.
 *
 * Priced the same way as the forecast — seconds per kilometre run, over the
 * kilometres still to come, capped at the gap to the goal — so the two
 * numbers differ only in which stretch of history set the rate.
 *
 * A `RecentTrendGap` when the readings do not reach back `MIN_RECENT_DAYS`,
 * or nothing was run in the window to divide by.
 */
export function recentTrend({
	nowSeconds,
	now,
	goalSeconds,
	samples,
	done,
	remainingKm
}: {
	nowSeconds: number;
	now: Date;
	goalSeconds: number;
	samples: Sample[];
	done: VolumeWeek[];
	remainingKm: number;
}): RecentTrend | RecentTrendGap {
	const points = samples
		.map((s) => ({ stamp: new Date(s.date).getTime(), seconds: s.seconds }))
		.filter((p) => Number.isFinite(p.stamp) && Number.isFinite(p.seconds))
		.sort((a, b) => a.stamp - b.stamp);
	if (points.length === 0) return { reason: 'no-readings' };

	const windowStart = now.getTime() - RECENT_WINDOW_DAYS * DAY_MS;
	// Readings are only written when the prediction changes, so the last one at
	// or before the window opens is still what the prediction was when it did.
	// Without one, the window starts at the first reading there is.
	const before = points.filter((p) => p.stamp <= windowStart).at(-1);
	const baseline = before ?? points[0];
	const from = before ? windowStart : baseline.stamp;

	const days = (now.getTime() - from) / DAY_MS;
	if (!(days >= MIN_RECENT_DAYS)) {
		return { reason: 'few-days', days: Math.max(0, Math.floor(days)), needed: MIN_RECENT_DAYS };
	}

	// Up to a week past today, so the current week's kilometres count whole: a
	// week's distance is spread across its seven days, and stopping at today
	// would credit only the share of what was run that falls before now.
	const km = volumeBetween(done, new Date(from), new Date(now.getTime() + WEEK_MS));
	if (!(km > 0)) return { reason: 'no-km', days: Math.round(days) };

	const gainSeconds = baseline.seconds - nowSeconds;
	const secondsPerKm = gainSeconds / km;

	// Same cap as the forecast, for the same reason: the remaining plan is never
	// credited with closing more than the gap that is actually there.
	const uncapped = secondsPerKm > 0 ? secondsPerKm * remainingKm : 0;
	const currentGap = nowSeconds - goalSeconds;
	const capped = currentGap > 0 && uncapped > currentGap;
	const gain = capped ? currentGap : uncapped;

	return {
		days: Math.round(days),
		gainSeconds,
		km,
		secondsPerKm,
		endSeconds: nowSeconds - gain,
		capped
	};
}

/**
 * Each planned week, clipped to the window where training still earns.
 *
 * Exported on its own because the kilometres ahead are real whether or not
 * there is enough history to price a forecast from them — a caller that
 * wants to draw the load bars without a forecast (or when one failed to
 * build) still needs this half of the arithmetic.
 */
export function loadSlices(planned: VolumeWeek[], now: Date, cutoff: Date): LoadSlice[] {
	const slices: LoadSlice[] = [];
	for (const week of planned) {
		const start = week.startsOn.getTime();
		if (!Number.isFinite(start)) continue;
		const from = new Date(Math.max(start, now.getTime()));
		const to = new Date(Math.min(start + WEEK_MS, cutoff.getTime()));
		if (to <= from) continue;
		slices.push({ from, to, km: volumeBetween([week], from, to) });
	}
	return slices;
}
