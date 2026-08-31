import { supabase } from './client';
import { storageFailed } from './errors';
import {
	fitCurve,
	fitExponent,
	curveThrough,
	curveSeconds,
	impliedDistanceKm,
	RIEGEL_EXPONENT,
	type RacePoint,
	type RiegelCurve
} from '$lib/utils/race-equivalent';
import { secondsToTimeString, secondsToPaceString, timeStringToSeconds } from '$lib/utils/format';

export interface PredictionRecord {
	id: number;
	user_id: number;
	/** Prediction for the user's current goal distance. */
	predicted_time: string;
	predicted_pace: string;
	/**
	 * Prediction for a fixed 10K reference distance. Null on rows recorded
	 * before 10K tracking was introduced.
	 */
	predicted_time_10k: string | null;
	predicted_pace_10k: string | null;
	/**
	 * The 10K equivalent read off this row's own Riegel curve, `a * 10^e`.
	 *
	 * Filled in for rows written before the API's 10K figure was recorded, so
	 * the all-time series is not four points long. Kept apart from the recorded
	 * columns on purpose: a derived value that has been mixed in with a measured
	 * one cannot be told from it afterwards.
	 *
	 * Null on a row that has a recorded 10K — there is nothing to derive — and
	 * on one that has no curve, which is a row whose stored pair implies no
	 * usable distance.
	 */
	derived_time_10k: string | null;
	derived_pace_10k: string | null;
	/**
	 * The Riegel curve this day's predictions sit on, `T = a * D^e`.
	 *
	 * `riegel_level` is `a`, in seconds over one kilometre: where the curve
	 * sits, which is the runner's fitness that day. `riegel_exponent` is `e`:
	 * how steeply it rises, which is the shape of their endurance. The first
	 * moves week to week, the second over months, and neither can be read off
	 * the other — a runner can hold the same 10K while their marathon comes to
	 * them, and only `e` shows it.
	 *
	 * `riegel_source` says where `e` came from: `fitted` where this row's own
	 * predictions fixed it, `borrowed` where the row states one distance and it
	 * had to come from the nearest day that could. The level is a measurement of
	 * this day either way, but on a borrowed row it is only as right as the
	 * exponent it was projected on.
	 *
	 * Null together on a row the back-fill has not reached, or one that states
	 * nothing usable.
	 */
	riegel_exponent: number | null;
	riegel_level: number | null;
	riegel_source: CurveSource | null;
	/**
	 * The rest of the set the stats response carried that day, as recorded.
	 *
	 * Times only — a pace is the time over a known distance, and storing both
	 * invites them to disagree. Null on a row written by a client that sends
	 * only the goal and 10K predictions.
	 */
	predicted_time_5k: string | null;
	predicted_time_half: string | null;
	predicted_time_marathon: string | null;
	recorded_at: string;
	created_at: string;
}

/** The 10K reference prediction recorded alongside the goal prediction. */
export interface TenKPrediction {
	time: string;
	pace: string;
}

/**
 * The other distances the same response predicted.
 *
 * Optional throughout: a client that only knows about the goal and the 10K
 * still records what it has, and the columns stay null.
 */
export interface PredictionSet {
	time5k?: string;
	timeHalf?: string;
	timeMarathon?: string;
}

interface PredictionHistoryOptions {
	startDate?: string;
	endDate?: string;
	limit?: number;
}

/** The four distances a recorded prediction set covers, in km. */
const SET_DISTANCES_KM = {
	predicted_time_5k: 5,
	predicted_time_10k: 10,
	predicted_time_half: 21.0975,
	predicted_time_marathon: 42.195
} as const;

/** One day's recorded predictions, as far as the columns go. */
type RecordedSet = Partial<Record<keyof typeof SET_DISTANCES_KM, string | null>>;

/** Where a row's exponent came from. */
export type CurveSource = 'fitted' | 'borrowed';

/** A row as much of it as a curve can be built from. */
interface CurveRow extends RecordedSet {
	predicted_time?: string | null;
	predicted_pace?: string | null;
}

/**
 * How the stored curve is rounded, matching `NUMERIC(6, 4)` and `NUMERIC(9, 3)`
 * in the schema.
 *
 * Rounded here rather than left to the column, so that what the row says and
 * what the derived 10K beside it was computed from are the same numbers. A
 * value rounded on the way in is reproducible from the row afterwards; one
 * rounded by the column is not.
 */
const EXPONENT_DECIMALS = 4;
const LEVEL_DECIMALS = 3;

/** The curve columns for a row, at the precision the schema stores. */
function curveColumns(curve: RiegelCurve, source: CurveSource) {
	return {
		riegel_exponent: Number(curve.exponent.toFixed(EXPONENT_DECIMALS)),
		riegel_level: Number(curve.level.toFixed(LEVEL_DECIMALS)),
		riegel_source: source
	};
}

/** Those columns read back as a curve, so a caller uses the stored numbers. */
function storedCurve(columns: { riegel_exponent: number; riegel_level: number }): RiegelCurve {
	return { exponent: columns.riegel_exponent, level: columns.riegel_level };
}

/**
 * How many days of recorded sets to fit the exponent from.
 *
 * The exponent is the shape of a runner and moves slowly, so this is about
 * having enough rows for a median to mean something rather than about being
 * current. Small enough that the fit stays one cheap query.
 */
const EXPONENT_SAMPLE_ROWS = 30;

/** A recorded set as the points it states, dropping the columns it left null. */
function setPoints(row: RecordedSet): RacePoint[] {
	const points: RacePoint[] = [];

	for (const [column, km] of Object.entries(SET_DISTANCES_KM)) {
		const time = row[column as keyof typeof SET_DISTANCES_KM];
		if (time) points.push({ km, seconds: timeStringToSeconds(time) });
	}

	return points;
}

/**
 * Everything a row states about the curve, the goal prediction included.
 *
 * The goal-distance prediction is on the same curve as the rest of the block —
 * that is what makes the block one estimate rather than five — so it is a point
 * like any other, and on a row that has a recorded 10K and nothing else it is
 * the second point that makes a fit possible at all. Which is most of the rows
 * between the 10K column arriving and the rest of the set arriving.
 *
 * Its distance is inferred rather than stated, and `impliedDistanceKm` rounds
 * anything non-standard to the half kilometre, so it is the least precise point
 * in the set. `fitCurve` refuses a span too short to survive that; where the
 * other distances are present they outvote it.
 */
function curvePoints(row: CurveRow): RacePoint[] {
	const points = setPoints(row);

	if (row.predicted_time && row.predicted_pace) {
		const km = impliedDistanceKm(row.predicted_time, row.predicted_pace);
		if (km !== null) points.push({ km, seconds: timeStringToSeconds(row.predicted_time) });
	}

	return points;
}

/** The reference distance the derived series is plotted against, in km. */
const TEN_K = 10;

/** A row the curve back-fill reads, as much of it as it needs. */
interface BackfillRow extends RecordedSet {
	id: number;
	recorded_at: string;
	predicted_time: string;
	predicted_pace: string;
	predicted_time_10k: string | null;
}

/** An exponent and the day it was measured on. */
interface DatedExponent {
	recorded_at: string;
	exponent: number;
}

/**
 * The measured exponent closest in time to a day that has none.
 *
 * The exponent is the shape of a runner and moves over months, so the day
 * beside a gap describes it better than an average over years — and outside the
 * measured range this carries the nearest end outwards rather than inventing a
 * trend, which is the least this can claim while still claiming something.
 *
 * Ties go to the earlier day, which only matters for a row exactly between two
 * measurements.
 */
function nearestExponent(spine: DatedExponent[], on: string): number | null {
	const day = Date.parse(on);
	if (spine.length === 0 || Number.isNaN(day)) return null;

	let best = spine[0];
	let bestGap = Math.abs(Date.parse(best.recorded_at) - day);
	for (const candidate of spine.slice(1)) {
		const gap = Math.abs(Date.parse(candidate.recorded_at) - day);
		if (gap < bestGap) {
			best = candidate;
			bestGap = gap;
		}
	}

	return best.exponent;
}

/** The curve through a row's single prediction, on a borrowed exponent. */
function borrowedCurve(row: BackfillRow, spine: DatedExponent[]): RiegelCurve | null {
	const km = impliedDistanceKm(row.predicted_time, row.predicted_pace);
	if (km === null || km <= 0) return null;

	return curveThrough(
		timeStringToSeconds(row.predicted_time),
		km,
		nearestExponent(spine, row.recorded_at) ?? RIEGEL_EXPONENT
	);
}

/** A curve as the 10K columns it implies, `a * 10^e`. */
function derivedTenK(curve: RiegelCurve) {
	const seconds = curveSeconds(curve, TEN_K);
	if (!Number.isFinite(seconds) || seconds <= 0) return {};

	return {
		derived_time_10k: secondsToTimeString(Math.round(seconds)),
		derived_pace_10k: secondsToPaceString(Math.round(seconds / TEN_K))
	};
}

/** The middle value, averaging the two middles of an even count. */
function median(values: number[]): number | null {
	if (values.length === 0) return null;

	const sorted = [...values].sort((a, b) => a - b);
	const middle = Math.floor(sorted.length / 2);
	return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export class PredictionValidator {
	private static readonly TIME_REGEX = /^\d{1,2}:\d{2}(:\d{2})?$/;
	private static readonly PACE_REGEX = /^\d{1,2}:\d{2}$/;

	static validateTime(time: string): boolean {
		return this.TIME_REGEX.test(time);
	}

	static validatePace(pace: string): boolean {
		return this.PACE_REGEX.test(pace);
	}

	static validateUserId(userId: number): boolean {
		return Number.isInteger(userId) && userId > 0;
	}

	static validateDate(date: string): boolean {
		return !isNaN(Date.parse(date));
	}
}

export class PredictionHistoryDAO {
	private static instance: PredictionHistoryDAO;

	private constructor() {}

	static getInstance(): PredictionHistoryDAO {
		if (!PredictionHistoryDAO.instance) {
			PredictionHistoryDAO.instance = new PredictionHistoryDAO();
		}
		return PredictionHistoryDAO.instance;
	}

	async getLatestPrediction(userId: number): Promise<PredictionRecord | null> {
		const { data, error } = await supabase
			.from('prediction_history')
			.select('*')
			.eq('user_id', userId)
			.order('recorded_at', { ascending: false })
			.order('created_at', { ascending: false })
			.limit(1)
			.single();

		if (error || !data) return null;
		return data as PredictionRecord;
	}

	async getUserPredictionHistory(
		userId: number,
		options: PredictionHistoryOptions = {}
	): Promise<PredictionRecord[]> {
		let query = supabase
			.from('prediction_history')
			.select('*')
			.eq('user_id', userId)
			.order('recorded_at', { ascending: true });

		if (options.startDate) {
			query = query.gte('recorded_at', options.startDate);
		}
		if (options.endDate) {
			query = query.lte('recorded_at', options.endDate);
		}
		if (options.limit) {
			query = query.limit(options.limit);
		}

		const { data, error } = await query;

		// The series behind the history page and the goal card's chart. An
		// unreadable table used to plot as a flat "no progress recorded", which
		// is a claim about the runner's training rather than about the database.
		if (error) storageFailed('prediction history read', error);

		return (data ?? []) as PredictionRecord[];
	}

	/**
	 * The Riegel exponent this user's own predictions follow.
	 *
	 * Not a constant: the exponent is how steeply a runner's time rises with
	 * distance, which is a fact about the runner. A marathoner who holds pace
	 * sits below 1.06 where someone quick over 5 km and fading sits above 1.08,
	 * and on a three-hour conversion that spread is minutes. Converting every
	 * user's history on one captured account's number is the one thing here that
	 * cannot be right for more than one person.
	 *
	 * Their own rows already carry the answer. A row written since the full set
	 * was recorded holds the predictions the API made on one day at several
	 * known distances — the goal one included, which is what lets a row with
	 * nothing but a goal and a 10K contribute — and those all lie on the curve
	 * the API drew for this runner. Fitting a slope through them recovers it.
	 *
	 * This is the runner as they are now. The per-day exponent stored on each row
	 * is the same measurement kept in place, and is what a chart of how their
	 * endurance has changed should read; do not use this for a past day.
	 *
	 * Per row, then the median across rows, rather than one fit over everything:
	 * each row is one day at one fitness level, and pooling days puts several
	 * levels through a single line and tilts the slope between them. The median
	 * is for the odd day where the API returned something strange — one such row
	 * moves a mean and not a median.
	 *
	 * Falls back to `RIEGEL_EXPONENT` for a user with no complete row yet, which
	 * is the same conversion they were getting before and no worse. A read that
	 * fails outright takes the same fallback rather than raising: this is a
	 * refinement to a conversion that has a defined answer without it, and no
	 * page is worth failing over which exponent it used.
	 */
	async riegelExponent(userId: number): Promise<number> {
		const { data, error } = await supabase
			.from('prediction_history')
			.select(
				'predicted_time, predicted_pace, predicted_time_5k, predicted_time_10k, predicted_time_half, predicted_time_marathon'
			)
			.eq('user_id', userId)
			.not('predicted_time_10k', 'is', null)
			.order('recorded_at', { ascending: false })
			.limit(EXPONENT_SAMPLE_ROWS);

		if (error) {
			console.error('Failed to read rows to fit the exponent:', error.message);
			return RIEGEL_EXPONENT;
		}

		const fitted = ((data ?? []) as CurveRow[])
			.map((row) => fitExponent(curvePoints(row)))
			.filter((e): e is number => e !== null);

		return median(fitted) ?? RIEGEL_EXPONENT;
	}

	/**
	 * Fit and store the Riegel curve behind every row that has none yet.
	 *
	 * A back-fill rather than a conversion on read: the curve belongs to the row
	 * it was measured from, and re-deriving it on every page load would put the
	 * same arithmetic behind every chart that ever wants the series. It is also
	 * what makes the derived 10K reproducible — that column is now exactly
	 * `a * 10^e` for the row it sits on, rather than whatever a median over
	 * recent rows happened to be on the day the back-fill ran.
	 *
	 * Two passes, because the rows are not equally informative:
	 *
	 * A row that states two or more distances fixes its own exponent, and those
	 * are `fitted`. A row that states one — the goal prediction, which is all
	 * the older rows have — fixes a level and no slope, so it borrows the
	 * exponent from the nearest day that could fit one, and is marked
	 * `borrowed`. Nearest in time rather than a median over everything: the
	 * exponent moves, slowly, and a runner's shape three years and four goals
	 * ago is better described by the earliest day we can measure than by who
	 * they are this month. `RIEGEL_EXPONENT` remains the answer for a user with
	 * no fittable row anywhere, which is the conversion they were getting
	 * before.
	 *
	 * Idempotent and best-effort: it only reads rows whose curve is missing, so
	 * a second run does nothing, and a failure leaves the caller with whatever
	 * was already there. Returns how many rows it wrote.
	 */
	async backfillRiegelCurve(userId: number, limit = 500): Promise<number> {
		const { data, error } = await supabase
			.from('prediction_history')
			.select(
				'id, recorded_at, predicted_time, predicted_pace, predicted_time_10k, predicted_time_5k, predicted_time_half, predicted_time_marathon'
			)
			.eq('user_id', userId)
			.is('riegel_exponent', null)
			.order('recorded_at', { ascending: true })
			.limit(limit);

		if (error || !data?.length) {
			if (error) console.error('Failed to read rows to fit the curve:', error.message);
			return 0;
		}

		// Every fit first, then the writes: a row that cannot fit its own
		// exponent borrows from the days around it, and those days may be in this
		// same batch.
		const rows = data as BackfillRow[];
		const fitted = rows.map((row) => fitCurve(curvePoints(row)));
		// Nothing to borrow for means nothing to borrow from, and the second query
		// is skipped: a user whose rows all state a full set never pays for it.
		const spine = fitted.every((curve) => curve !== null)
			? []
			: await this.exponentSpine(
					userId,
					rows.flatMap((row, i) =>
						fitted[i] ? [{ recorded_at: row.recorded_at, exponent: fitted[i]!.exponent }] : []
					)
				);

		let written = 0;
		for (let i = 0; i < rows.length; i++) {
			const row = rows[i];
			const curve = fitted[i] ?? borrowedCurve(row, spine);
			if (!curve) continue;

			const columns = curveColumns(curve, fitted[i] ? 'fitted' : 'borrowed');

			// Only where the API never gave a 10K. The recorded columns are a
			// measurement and nothing here is allowed to overwrite one.
			const derived = row.predicted_time_10k ? {} : derivedTenK(storedCurve(columns));

			const { error: writeError } = await supabase
				.from('prediction_history')
				.update({ ...columns, ...derived })
				.eq('id', row.id);

			if (writeError) {
				console.error('Failed to write a curve to a prediction row:', writeError.message);
				continue;
			}
			written++;
		}

		return written;
	}

	/**
	 * Every dated exponent this user has, to borrow from.
	 *
	 * The rows fitted in this batch plus the ones already stored, so a run that
	 * only picks up old rows can still reach the recent days that can measure a
	 * slope. Sorted, because `nearestExponent` walks it.
	 *
	 * A failed read is not fatal: it leaves whatever this batch fitted, and
	 * beyond that the captured constant.
	 */
	private async exponentSpine(
		userId: number,
		fromBatch: DatedExponent[]
	): Promise<DatedExponent[]> {
		const { data, error } = await supabase
			.from('prediction_history')
			.select('recorded_at, riegel_exponent')
			.eq('user_id', userId)
			.eq('riegel_source', 'fitted')
			.order('recorded_at', { ascending: true });

		if (error) console.error('Failed to read stored exponents:', error.message);

		const stored = ((data ?? []) as Array<{ recorded_at: string; riegel_exponent: number }>).map(
			(row) => ({ recorded_at: row.recorded_at, exponent: Number(row.riegel_exponent) })
		);

		return [...stored, ...fromBatch]
			.filter((e) => Number.isFinite(e.exponent))
			.sort((a, b) => Date.parse(a.recorded_at) - Date.parse(b.recorded_at));
	}

	async storeIfChanged(
		userId: number,
		time: string,
		pace: string,
		tenK?: TenKPrediction | null,
		set?: PredictionSet | null
	): Promise<{ stored: boolean; record?: PredictionRecord }> {
		if (!PredictionValidator.validateTime(time) || !PredictionValidator.validatePace(pace)) {
			return { stored: false };
		}

		// The 10K reference is secondary: if it is malformed we still record the
		// goal prediction rather than losing the day entirely.
		let reference: TenKPrediction | null = null;
		if (tenK) {
			if (
				PredictionValidator.validateTime(tenK.time) &&
				PredictionValidator.validatePace(tenK.pace)
			) {
				reference = tenK;
			} else {
				console.warn('Ignoring malformed 10K prediction:', tenK);
			}
		}

		// Only the times that parse. A malformed extra distance is dropped rather
		// than allowed to fail the write: the goal prediction is the point of the
		// row and the rest is supporting detail.
		const extras: Record<string, string> = {};
		if (set?.time5k && PredictionValidator.validateTime(set.time5k)) {
			extras.predicted_time_5k = set.time5k;
		}
		if (set?.timeHalf && PredictionValidator.validateTime(set.timeHalf)) {
			extras.predicted_time_half = set.timeHalf;
		}
		if (set?.timeMarathon && PredictionValidator.validateTime(set.timeMarathon)) {
			extras.predicted_time_marathon = set.timeMarathon;
		}

		// The curve, measured while every distance the response carried is in
		// hand. Fitting it now is what keeps the exponent a fact about this day:
		// a row written today and fitted next year would be fitted from the same
		// four columns, but a row that arrives incomplete would be filled in from
		// whoever the runner had become by then.
		const curve = fitCurve(
			curvePoints({
				predicted_time: time,
				predicted_pace: pace,
				predicted_time_10k: reference?.time ?? null,
				...extras
			})
		);
		// Fitted from this write's own points, so the source is always 'fitted'
		// here: a row that cannot be fitted is left for the back-fill, which is
		// the only thing that borrows. Rounded before anything is read off it, so
		// the row and the 10K beside it agree.
		const columns = curve ? curveColumns(curve, 'fitted') : null;

		const latest = await this.getLatestPrediction(userId);
		const unchanged =
			latest !== null &&
			latest.predicted_time === time &&
			latest.predicted_pace === pace &&
			// A newly available 10K reference is a change worth recording, even
			// when the goal prediction itself stayed put.
			(reference === null ||
				(latest.predicted_time_10k === reference.time &&
					latest.predicted_pace_10k === reference.pace)) &&
			// And so is a distance arriving for the first time, or moving: the
			// point of the set is that it is recorded rather than inferred, which
			// a skipped write would quietly undo.
			Object.entries(extras).every(
				([column, value]) => latest[column as keyof PredictionRecord] === value
			) &&
			// A row from before the curve was stored, on a day whose predictions
			// have not moved since, would otherwise never acquire one. Only when
			// there is a curve to write: a row that states one distance cannot be
			// fitted at all, and must not re-write itself every day over it.
			(curve === null || latest.riegel_exponent !== null);

		if (unchanged) {
			return { stored: false };
		}

		const today = new Date().toISOString().split('T')[0];
		const { data, error } = await supabase
			.from('prediction_history')
			.upsert(
				{
					user_id: userId,
					predicted_time: time,
					predicted_pace: pace,
					// Omitted when absent so an existing row's 10K values are not
					// overwritten with null by the upsert.
					...(reference
						? { predicted_time_10k: reference.time, predicted_pace_10k: reference.pace }
						: {}),
					// Same reasoning as the 10K pair: omitted rather than nulled, so a
					// client that cannot resolve a distance does not erase what an
					// earlier one recorded.
					...extras,
					...(columns ?? {}),
					// The API's own 10K is a measurement and is stored as one; this
					// is only for the write that did not carry it.
					...(!reference && columns ? derivedTenK(storedCurve(columns)) : {}),
					recorded_at: today
				},
				{ onConflict: 'user_id,recorded_at' }
			)
			.select()
			.single();

		// `stored: false` still means "there was nothing to store" — a malformed
		// reading, or one identical to today's. A write that was attempted and
		// failed is a different answer and now says so.
		if (error) storageFailed('prediction write', error);

		return { stored: true, record: data as PredictionRecord };
	}
}

export const predictionHistoryDAO = PredictionHistoryDAO.getInstance();
