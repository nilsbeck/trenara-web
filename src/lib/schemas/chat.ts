import { z } from 'zod';

/**
 * A message to Walter.
 *
 * Refined rather than `.trim()`med: the check is that there is something to
 * send, and the text goes upstream exactly as the runner typed it. The 10,000
 * character ceiling is a guard against a pathological body, far past any
 * message a runner writes by hand — Trenara's own limit has never been seen.
 */
export const sendMessageSchema = z.object({
	content: z
		.string()
		.max(10_000)
		.refine((s) => s.trim().length > 0, 'must not be empty')
});

/**
 * How far the reader has got in one thread. Zero is a real answer — a thread
 * opened before any message in it was shown.
 */
export const chatMarkReadSchema = z.object({
	lastSeenMessageId: z.number().int().nonnegative()
});
