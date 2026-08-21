import { z } from 'zod';

export const feedbackSchema = z.object({
	entryId: z.number().int().positive(),
	feedback: z.number().int().min(1).max(10)
});

export const changeDateSchema = z.object({
	entryId: z.number().int().positive(),
	newDate: z.string(),
	includeFuture: z.boolean().default(false),
	action: z.enum(['test', 'save']).default('save')
});

export type FeedbackData = z.infer<typeof feedbackSchema>;
export type ChangeDateData = z.infer<typeof changeDateSchema>;
