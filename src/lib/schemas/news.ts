import { z } from 'zod';

/**
 * How far the reader has got in the news feed.
 *
 * Both fields identify a news item they have been shown; the server only ever
 * moves a mark forward, so a stale client cannot un-read anything.
 */
export const newsMarkReadSchema = z.object({
	lastSeenId: z.number().int().positive(),
	// Unix seconds. Bounded below by the Trenara era and above by a decade out,
	// which catches milliseconds sent by mistake — a thousand-fold overshoot
	// would otherwise mark every future item as already read.
	lastSeenCreatedAt: z
		.number()
		.int()
		.min(1_000_000_000)
		.max(Math.floor(Date.now() / 1000) + 10 * 365 * 86400)
});

/** Page of the news feed to fetch. Ten items to a page, newest first. */
export const newsPageSchema = z.coerce.number().int().positive().max(1000).default(1);

export type NewsMarkReadData = z.infer<typeof newsMarkReadSchema>;
