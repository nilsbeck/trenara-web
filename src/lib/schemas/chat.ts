import { z } from 'zod';

/**
 * A message to Walter.
 *
 * Refined rather than `.trim()`med: the check is that there is something to
 * send, and the text goes upstream exactly as the runner typed it.
 */
export const sendMessageSchema = z.object({
	content: z.string().refine((s) => s.trim().length > 0, 'must not be empty')
});

/**
 * How far the reader has got in one thread. Zero is a real answer — a thread
 * opened before any message in it was shown.
 */
export const chatMarkReadSchema = z.object({
	lastSeenMessageId: z.number().int().nonnegative()
});
