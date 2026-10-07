import type { ScheduledTraining } from '$lib/server/trenara/types';

/**
 * The paragraphs of Trenara Intelligence's note on a session, or null when
 * there is nothing to show.
 *
 * The backend adjusts some sessions to the runner's recent load and explains
 * the change in `intelligence_text`, in the coach's voice. Two things are
 * checked rather than trusted: the flag, because a disabled session carries
 * `has_intelligence: false` with every companion `null`, and the text itself,
 * because a flag with nothing to say would draw an empty card. The text
 * separates its paragraphs with newlines and ends with one, so it is split on
 * them and blank lines are dropped — rendered as-is, the paragraphs would run
 * together.
 */
export function intelligenceParagraphs(
	training: Pick<ScheduledTraining, 'has_intelligence' | 'intelligence_text'> | null | undefined
): string[] | null {
	if (training?.has_intelligence !== true) return null;
	const text = training.intelligence_text;
	if (typeof text !== 'string') return null;
	const paragraphs = text
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line.length > 0);
	return paragraphs.length > 0 ? paragraphs : null;
}
