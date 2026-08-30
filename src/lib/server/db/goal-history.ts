import { supabase } from './client';
import { storageFailed } from './errors';

export interface GoalHistoryRecord {
	id: number;
	user_id: number;
	goal_name: string;
	distance: string;
	goal_time: string;
	goal_pace: string;
	final_predicted_time: string | null;
	final_predicted_pace: string | null;
	start_date: string;
	end_date: string;
	archived_at: string;
}

interface ArchiveGoalData {
	goal_name: string;
	distance: string;
	goal_time: string;
	goal_pace: string;
	final_predicted_time?: string | null;
	final_predicted_pace?: string | null;
	start_date: string;
	end_date: string;
}

export class GoalHistoryDAO {
	private static instance: GoalHistoryDAO;

	private constructor() {}

	static getInstance(): GoalHistoryDAO {
		if (!GoalHistoryDAO.instance) {
			GoalHistoryDAO.instance = new GoalHistoryDAO();
		}
		return GoalHistoryDAO.instance;
	}

	/**
	 * Everything the runner has archived, newest first.
	 *
	 * This is the whole of the goal history page, so a failure has to be a
	 * failure: returning `[]` told them they had never archived a goal, which
	 * for a page whose entire purpose is remembering is the worst thing it
	 * could say. An empty array now means empty.
	 */
	async getGoalHistory(userId: number): Promise<GoalHistoryRecord[]> {
		const { data, error } = await supabase
			.from('goal_history')
			.select('*')
			.eq('user_id', userId)
			.order('end_date', { ascending: false });

		if (error) storageFailed('goal history read', error);

		return (data ?? []) as GoalHistoryRecord[];
	}

	async archiveGoal(
		userId: number,
		goalData: ArchiveGoalData
	): Promise<{ stored: boolean; record?: GoalHistoryRecord }> {
		const { data, error } = await supabase
			.from('goal_history')
			.upsert(
				{
					user_id: userId,
					goal_name: goalData.goal_name,
					distance: goalData.distance,
					goal_time: goalData.goal_time,
					goal_pace: goalData.goal_pace,
					final_predicted_time: goalData.final_predicted_time ?? null,
					final_predicted_pace: goalData.final_predicted_pace ?? null,
					start_date: goalData.start_date,
					end_date: goalData.end_date
				},
				{ onConflict: 'user_id,goal_name,end_date' }
			)
			.select()
			.single();

		// `stored: false` was the only thing a failed write said, and it was
		// indistinguishable from a write that had nothing to do — so a goal the
		// runner believed was kept could be gone without a word anywhere.
		if (error) storageFailed('goal archive', error);

		return { stored: true, record: data as GoalHistoryRecord };
	}
}

export const goalHistoryDAO = GoalHistoryDAO.getInstance();
