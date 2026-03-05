import { z } from 'zod';

export const predictionRecordSchema = z.object({
	time: z.string().regex(/^\d{1,2}:\d{2}(:\d{2})?$/, 'Invalid time format'),
	pace: z.string().regex(/^\d{1,2}:\d{2}$/, 'Invalid pace format')
});

export const predictionHistoryQuerySchema = z.object({
	start_date: z.string().date().optional(),
	end_date: z.string().date().optional(),
	limit: z.coerce.number().int().positive().max(500).default(100)
});

export type PredictionRecord = z.infer<typeof predictionRecordSchema>;
export type PredictionHistoryQuery = z.infer<typeof predictionHistoryQuerySchema>;
