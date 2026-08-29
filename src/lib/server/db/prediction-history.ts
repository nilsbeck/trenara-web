import { supabase } from './client';
import { storageFailed } from './errors';
import {
	raceEquivalent,
	fitExponent,
	RIEGEL_EXPONENT,
	type RacePoint
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
	 * The 10K equivalent computed from this row's own goal-distance prediction.
	 *
	 * Filled in for rows written before the API's 10K figure was recorded, so
	 * the all-time series is not four points long. Kept apart from the recorded
	 * columns on purpose: a derived value that has been mixed in with a measured
	 * one cannot be told from it afterwards.
	 *
	 * Null on a row that has a recorded 10K — there is nothing to derive — and
	 * on one whose stored pair implies no usable distance.
	 */
	derived_time_10k: string | null;
	derived_pace_10k: string | null;
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
	 * was recorded holds four predictions the API made on one day at four known
	 * distances, and those four lie on the curve the API drew for this runner.
	 * Fitting a slope through them recovers it exactly.
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
			.select('predicted_time_5k, predicted_time_10k, predicted_time_half, predicted_time_marathon')
			.eq('user_id', userId)
			.not('predicted_time_10k', 'is', null)
			.order('recorded_at', { ascending: false })
			.limit(EXPONENT_SAMPLE_ROWS);

		if (error) {
			console.error('Failed to read rows to fit the exponent:', error.message);
			return RIEGEL_EXPONENT;
		}

		const fitted = ((data ?? []) as RecordedSet[])
			.map((row) => fitExponent(setPoints(row)))
			.filter((e): e is number => e !== null);

		return median(fitted) ?? RIEGEL_EXPONENT;
	}

	/**
	 * Fill in the 10K equivalent for rows that never recorded one.
	 *
	 * A back-fill rather than a conversion on read: the value belongs to the row
	 * it was computed from, and converting again on every page load would put
	 * the same arithmetic behind every chart that ever wants the series.
	 *
	 * Converted on this user's own exponent, so the series a runner is shown is
	 * on their curve rather than on a captured account's. The fit costs a second
	 * query, and is only made once there is something to convert — a caught-up
	 * user still pays for one empty query and nothing else.
	 *
	 * Idempotent and best-effort — it only ever touches rows where both the
	 * recorded and the derived 10K are missing, so a second run does nothing,
	 * and a failure leaves the caller with whatever was already there.
	 */
	async backfillDerivedTenK(userId: number, limit = 500): Promise<number> {
		const { data, error } = await supabase
			.from('prediction_history')
			.select('id, predicted_time, predicted_pace')
			.eq('user_id', userId)
			.is('predicted_time_10k', null)
			.is('derived_time_10k', null)
			.limit(limit);

		if (error || !data?.length) {
			if (error) console.error('Failed to read rows to back-fill:', error.message);
			return 0;
		}

		const exponent = await this.riegelExponent(userId);

		let filled = 0;
		for (const row of data as Array<{
			id: number;
			predicted_time: string;
			predicted_pace: string;
		}>) {
			const equivalent = raceEquivalent(row.predicted_time, row.predicted_pace, exponent);
			if (!equivalent) continue;

			const { error: writeError } = await supabase
				.from('prediction_history')
				.update({
					derived_time_10k: secondsToTimeString(Math.round(equivalent.seconds)),
					derived_pace_10k: secondsToPaceString(Math.round(equivalent.paceSeconds))
				})
				.eq('id', row.id);

			if (writeError) {
				console.error('Failed to back-fill a prediction row:', writeError.message);
				continue;
			}
			filled++;
		}

		return filled;
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
			);

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
