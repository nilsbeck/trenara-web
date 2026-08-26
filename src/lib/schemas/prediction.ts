import { z } from 'zod';

const timeString = z.string().regex(/^\d{1,2}:\d{2}(:\d{2})?$/, 'Invalid time format');
const paceString = z.string().regex(/^\d{1,2}:\d{2}$/, 'Invalid pace format');

export const predictionRecordSchema = z.object({
	// Prediction for the user's current goal distance.
	time: timeString,
	pace: paceString,
	// Fixed 10K reference, used for the comparable all-time history. Optional so
	// clients that cannot resolve it still record the goal prediction.
	time_10k: timeString.optional(),
	pace_10k: paceString.optional(),
	// The rest of the set the same response predicted. Optional for the same
	// reason, and times only: a pace is the time over a known distance, and
	// storing both invites them to disagree.
	time_5k: timeString.optional(),
	time_half: timeString.optional(),
	time_marathon: timeString.optional()
});

export const predictionHistoryQuerySchema = z.object({
	start_date: z.string().date().optional(),
	end_date: z.string().date().optional(),
	limit: z.coerce.number().int().positive().max(500).default(100)
});

export type PredictionRecord = z.infer<typeof predictionRecordSchema>;
