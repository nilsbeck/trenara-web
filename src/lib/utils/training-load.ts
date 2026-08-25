import type { Entry } from '$lib/server/trenara/types';

export interface TrainingLoad {
	/** What the session earned, rounded for display. */
	done: number;
	/** What the plan asked of that day, rounded for display. */
	goal: number;
	/** `done / goal`. Over 1 is a normal outcome, not an error. */
	ratio: number;
}

/**
 * The training load behind the coach's message on a completed session.
 *
 * The API sends the numbers in the same object as the sentence and the app has
 * only ever shown the sentence. Both are worth having: "you're really trying"
 * reads very differently next to 37 against 45.
 *
 * Returns null whenever the figures are not both there. The metadata is typed
 * as one fixed shape but varies by notification kind — a medal notification
 * carries none of this, and the add-entry response's metadata is typed without
 * the load fields entirely — so presence is checked rather than trusted.
 */
export function trainingLoad(entry: Entry | null | undefined): TrainingLoad | null {
	const metadata = entry?.notification?.metadata as
		{ done_tss?: unknown; goal_daily_tss?: unknown } | undefined;
	if (!metadata) return null;

	const done = metadata.done_tss;
	const goal = metadata.goal_daily_tss;
	if (typeof done !== 'number' || typeof goal !== 'number') return null;
	if (!Number.isFinite(done) || !Number.isFinite(goal) || goal <= 0) return null;

	return { done: Math.round(done), goal: Math.round(goal), ratio: done / goal };
}
