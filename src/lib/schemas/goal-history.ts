import { z } from 'zod';

// Trenara reports durations and paces without zero-padding ("3:45:00", "5:20")
// and sometimes appends the unit ("5:20 min/km"), so accept those shapes and
// normalise before validating rather than rejecting them.
const timeString = z.string().regex(/^\d{1,2}:\d{2}(:\d{2})?$/, 'Invalid time format');

const paceString = z
	.string()
	.transform((value) => value.replace(/\s*min\/(km|mi)\s*/i, '').trim())
	.pipe(z.string().regex(/^\d{1,2}:\d{2}$/, 'Invalid pace format'));

export const archiveGoalSchema = z.object({
	goal_name: z.string().min(1).max(255),
	distance: z.string().min(1).max(50),
	goal_time: timeString,
	goal_pace: paceString,
	final_predicted_time: timeString.nullable().optional(),
	final_predicted_pace: paceString.nullable().optional(),
	start_date: z.string().date(),
	end_date: z.string().date()
});

export type ArchiveGoalData = z.infer<typeof archiveGoalSchema>;
