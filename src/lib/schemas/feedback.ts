import { z } from 'zod';

export const rpeFeedbackSchema = z.object({
	entryId: z.number().int().positive(),
	feedback: z.number().int().min(1).max(10)
});

export type RpeFeedbackData = z.infer<typeof rpeFeedbackSchema>;
