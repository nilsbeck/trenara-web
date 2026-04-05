import { z } from 'zod';

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
const timeRegex = /^\d{2}:\d{2}:\d{2}$/;
const paceRegex = /^\d{2}:\d{2}$/;

export const archiveGoalSchema = z.object({
	goal_name: z.string().min(1).max(255),
	distance: z.string().min(1).max(50),
	goal_time: z.string().regex(timeRegex, 'goal_time must be HH:MM:SS'),
	goal_pace: z.string().regex(paceRegex, 'goal_pace must be MM:SS'),
	final_predicted_time: z.string().regex(timeRegex).nullable().optional(),
	final_predicted_pace: z.string().regex(paceRegex).nullable().optional(),
	start_date: z.string().regex(dateRegex, 'start_date must be YYYY-MM-DD'),
	end_date: z.string().regex(dateRegex, 'end_date must be YYYY-MM-DD')
});

export type ArchiveGoalData = z.infer<typeof archiveGoalSchema>;
