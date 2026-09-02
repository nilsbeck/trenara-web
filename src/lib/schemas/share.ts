import { z } from 'zod';

/**
 * `graph_stats.goal`'s row shape, as `readPlanWeeks` reads it — see
 * `$lib/utils/plan-weeks.ts`.
 */
const planWeekRow = z.object({
	week: z.number(),
	order: z.number(),
	month: z.string(),
	year: z.number(),
	is_current_week: z.boolean(),
	done: z.string().nullable(),
	done_value: z.number().nullable(),
	done_unit: z.string().nullable(),
	done_unit_text: z.string().nullable(),
	todo: z.string(),
	todo_value: z.number(),
	todo_unit: z.string(),
	todo_unit_text: z.string()
});

const planWeeks = z.object({
	data: z.array(planWeekRow),
	done: z.string(),
	done_value: z.number(),
	done_unit: z.string(),
	done_unit_text: z.string(),
	todo: z.string(),
	todo_value: z.number(),
	todo_unit: z.string(),
	todo_unit_text: z.string()
});

/** `SharedSnapshot` as first written. See `$lib/server/share/snapshot.ts`. */
const sharedSnapshotV1 = z.object({
	v: z.literal(1),
	goal: z.object({
		name: z.string(),
		start_date: z.string(),
		end_date: z.string(),
		distance: z.string(),
		distance_unit: z.string(),
		distance_value: z.number(),
		time: z.string(),
		time_in_sec: z.number(),
		pace: z.string()
	}),
	best_times: z.object({
		time_for_goal: z.string(),
		pace_for_goal: z.string()
	}),
	plan_weeks: planWeeks
});

/**
 * Every snapshot version still in the wild.
 *
 * A stored snapshot is read back by a later deploy than the one that wrote
 * it, so this has to keep understanding every shape that is still sitting in
 * the table — not just the one the current server writes. A discriminated
 * union on `v` is what that reads as in code: adding a version means adding an
 * arm here, never replacing one. See "Evolving the snapshot" in
 * `.kiro/specs/goal-sharing/design.md`.
 *
 * A snapshot that fails to parse — one written by a shape this schema does
 * not carry an arm for — is not an error to the caller: it is read the same
 * way as no snapshot at all. See `src/routes/s/[token]/+page.server.ts`.
 */
export const sharedSnapshotSchema = z.discriminatedUnion('v', [sharedSnapshotV1]);

export type ParsedSharedSnapshot = z.infer<typeof sharedSnapshotSchema>;

/**
 * The body `POST`/`PUT /api/v1/goal-share` accept — the one thing a runner
 * authors about their own link.
 *
 * `title` alone: the goal id is never taken from a request body, per the
 * invariant in `agents.md` §3 — it is read server-side from `/api/goal`.
 *
 * Bounded well past the 80 characters a title is actually kept to, and no
 * tighter: the real trim-and-cap happens in the route after parsing, on the
 * trimmed string, so that two spaces either side of a title exactly 80
 * characters long are not a 400. This length is a sanity ceiling against a
 * pathological body, not the product rule.
 */
export const shareTitleSchema = z.object({
	title: z.string().max(500).nullable().optional()
});
