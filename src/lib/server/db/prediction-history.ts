import { supabase } from './client';

interface PredictionRecord {
	id: number;
	user_id: number;
	predicted_time: string;
	predicted_pace: string;
	recorded_at: string;
	created_at: string;
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

	async storeIfChanged(
		userId: number,
		time: string,
		pace: string
	): Promise<{ stored: boolean; record?: PredictionRecord }> {
		if (!PredictionValidator.validateTime(time) || !PredictionValidator.validatePace(pace)) {
			return { stored: false };
		}

		const latest = await this.getLatestPrediction(userId);
		if (latest && latest.predicted_time === time && latest.predicted_pace === pace) {
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
