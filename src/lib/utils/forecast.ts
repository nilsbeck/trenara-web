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
 * preferring over the plan's own design rate.
 */
export function observedRate(samples: Sample[], done: VolumeWeek[]): RateEstimate | null {
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

	if (intervals.length < MIN_INTERVALS) return null;

	let numerator = 0;
	let denominator = 0;
	for (const step of intervals) {
		numerator += step.km * step.gain;
		denominator += step.km ** 2;
	}
	if (denominator === 0) return null;

	const secondsPerKm = numerator / denominator;
	// A rate at or below zero says this runner has been getting slower. That may
	// well be true, but it is not something to extend to race day as a forecast:
	// fall back to what the plan intends instead of drawing a line that promises
	// decline.
	if (!(secondsPerKm > 0)) return null;

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
	if (rSquared < MIN_RATE_FIT) return null;

	return { secondsPerKm, source: 'observed', intervals: intervals.length, rSquared };
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
	 * remaining can run them again.
	 */
	shortfallSeconds: number;
	/** Seconds the remaining plan is worth in total. */
	gainSeconds: number;
	/** Kilometres left that still change race-day fitness. */
	remainingKm: number;
	/** Kilometres the plan asked for up to today. */
	askedToDateKm: number;
	/** And how many were actually run. */
	doneToDateKm: number;
	rate: RateEstimate;
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
	const rate =
		observedRate(samples, done) ??
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
	const gainSeconds = remainingKm * secondsPerKm;
	const endSeconds = nowSeconds - gainSeconds;

	// A point at every week boundary, so the line bends where the volume does —
	// flattening through the taper instead of running straight at the goal.
	//
	// The boundaries are the only vertices there are: a week's kilometres are
	// spread evenly across its seven days, so the line is straight *within* a
	// week by construction and can only change slope where one week hands over
	// to the next. Points in between would be collinear padding.
	const points: ForecastPoint[] = [
		{ date: iso(now), seconds: nowSeconds, kmToDate: 0, segmentKm: 0, kind: 'today' }
	];

	function at(when: Date, kind: ForecastPoint['kind']): void {
		const kmToDate = volumeBetween(planned, now, when);
		points.push({
			date: iso(when),
			seconds: nowSeconds - kmToDate * secondsPerKm,
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
		date: iso(raceDay),
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
		points,
		load: loadSlices(planned, now, cutoff)
	};
}

/** Each planned week, clipped to the window where training still earns. */
function loadSlices(planned: VolumeWeek[], now: Date, cutoff: Date): LoadSlice[] {
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

function iso(d: Date): string {
	return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}
