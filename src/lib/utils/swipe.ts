/**
 * Horizontal swipe recognition.
 *
 * The thresholds and the damping live here rather than in the component so the
 * awkward cases — a tap that wobbles, a page scroll that starts with a slight
 * sideways drift, a fling that runs off the edge of the screen — can be pinned
 * down without a pointer to drive them.
 */

/** How far a pointer has to travel before the gesture is a swipe and not a tap. */
export const SWIPE_ACTIVATION = 10;

/** How far a swipe has to have travelled for releasing it to count as a step. */
export const SWIPE_THRESHOLD = 48;

/** The furthest the content follows the finger, however far the finger goes. */
export const SWIPE_MAX_FOLLOW = 96;

/**
 * How much of the finger's travel the content takes up.
 *
 * Under 1 deliberately: the content lagging behind the finger is what says the
 * gesture is being weighed rather than obeyed, and it keeps a long drag from
 * dragging the grid clean off its own card.
 */
const FOLLOW_DAMPING = 0.5;

/** Which way a released gesture went, if it went anywhere. */
export type SwipeStep = 'previous' | 'next' | null;

/**
 * Whether a movement has committed to the horizontal axis.
 *
 * The calendar sits in a page that scrolls, so a gesture is only the grid's
 * once it has gone further sideways than up or down. Anything steeper is the
 * runner scrolling past, and claiming it would pin the page under their thumb.
 */
export function isHorizontalSwipe(dx: number, dy: number): boolean {
	return Math.abs(dx) >= SWIPE_ACTIVATION && Math.abs(dx) > Math.abs(dy);
}

/** How far from its resting place the grid should sit for a given travel. */
export function followOffset(dx: number): number {
	const damped = dx * FOLLOW_DAMPING;
	return Math.max(-SWIPE_MAX_FOLLOW, Math.min(SWIPE_MAX_FOLLOW, damped));
}

/**
 * The step a released gesture asks for, or `null` if it never went far enough.
 *
 * Dragging left pulls the next period into view from the right, the way a
 * photo roll moves — so a negative travel is a step forward.
 */
export function swipeStep(dx: number): SwipeStep {
	if (dx <= -SWIPE_THRESHOLD) return 'next';
	if (dx >= SWIPE_THRESHOLD) return 'previous';
	return null;
}
