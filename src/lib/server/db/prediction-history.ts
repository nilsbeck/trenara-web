import { supabase } from './client';
import { raceEquivalent } from '$lib/utils/race-equivalent';
import { secondsToTimeString, secondsToPaceString } from '$lib/utils/format';

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
		if (error) {
			console.error('Failed to fetch prediction history:', error.message);
			return [];
		}
		return (data ?? []) as PredictionRecord[];
	}

	/**
	 * Fill in the 10K equivalent for rows that never recorded one.
	 *
	 * A back-fill rather than a conversion on read: the value belongs to the row
	 * it was computed from, and converting again on every page load would put
	 * the same arithmetic behind every chart that ever wants the series.
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

		let filled = 0;
		for (const row of data as Array<{
			id: number;
			predicted_time: string;
			predicted_pace: string;
		}>) {
			const equivalent = raceEquivalent(row.predicted_time, row.predicted_pace);
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

		if (error) {
			console.error('Failed to store prediction:', error.message);
			return { stored: false };
		}

		return { stored: true, record: data as PredictionRecord };
	}
}

export const predictionHistoryDAO = PredictionHistoryDAO.getInstance();
