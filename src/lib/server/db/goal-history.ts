import { supabase } from './client';

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

	async getGoalHistory(userId: number): Promise<GoalHistoryRecord[]> {
		const { data, error } = await supabase
			.from('goal_history')
			.select('*')
			.eq('user_id', userId)
			.order('end_date', { ascending: false });

		if (error) {
			console.error('Failed to fetch goal history:', error.message);
			return [];
		}
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

		if (error) {
			console.error('Failed to archive goal:', error.message);
			return { stored: false };
		}

		return { stored: true, record: data as GoalHistoryRecord };
	}
}

export const goalHistoryDAO = GoalHistoryDAO.getInstance();
