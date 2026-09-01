import { z } from 'zod';

/**
 * Pausing the plan, and the reason for it.
 *
 * `type` is a plain bounded string rather than an enum, for the same reason
 * `crossTrainSchema` is: the list of reasons is served by `/api/config/app` and
 * that served list is the source of truth. Spelling the five reasons captured
 * so far into a `z.enum` here would refuse a sixth the backend had already
 * started offering — a picker showing an option this endpoint then rejects.
 * `PAUSE_TYPES` is the fallback for the picker, not a whitelist for the wire.
 *
 * `extra_input` is optional here and required by some reasons upstream
 * (`ask_extra_input` marks them). That gate is not re-derived on this side: the
 * flag lives on the served list, the app renders the textarea from it, and
 * Trenara refuses a reason that arrives without the words it wanted. Copying
 * the rule here would give it a second home to disagree from.
 *
 * The 1000-character bound is a sanity limit on a free-text field, not a
 * transcription of a backend rule — the real limit is unknown, and a refusal
 * that names it is passed through.
 */
export const pauseGoalSchema = z.object({
	type: z.string().min(1).max(64),
	extraInput: z.string().max(1000).default('')
});

export type PauseGoalInput = z.infer<typeof pauseGoalSchema>;
