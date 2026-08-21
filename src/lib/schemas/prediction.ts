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
	pace_10k: paceString.optional()
});

export const predictionHistoryQuerySchema = z.object({
	start_date: z.string().date().optional(),
	end_date: z.string().date().optional(),
	limit: z.coerce.number().int().positive().max(500).default(100)
});

export type PredictionRecord = z.infer<typeof predictionRecordSchema>;
export type PredictionHistoryQuery = z.infer<typeof predictionHistoryQuerySchema>;
