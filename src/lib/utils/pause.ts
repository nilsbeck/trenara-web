import type { AppConfig, PauseType } from '$lib/server/trenara/types';

/**
 * Why a plan is paused, and what to ask for alongside the reason.
 *
 * The list is served by `/api/config/app` and the served list wins — a reason
 * added upstream has to reach the picker without a deploy here. `FALLBACK_REASONS`
 * stands in only when the config request failed, which is a state the layout
 * tolerates by design (it streams the config and reports a failure as `null`).
 *
 * It lives here rather than beside `PauseType` in `$lib/server/trenara/types`
 * because a component may only take *types* from `$lib/server` — a runtime
 * import from there is refused by SvelteKit's server-only check. Same reason
 * `SURFACES` and `ACTIVITIES` sit in `session-setup.ts`.
 */

export interface PauseReason {
	/** The wire value for `POST /api/v1/goal/pause`. */
	type: string;
	/** The label to show. Localised upstream — never key off it. */
	label: string;
	/** True when this reason wants a free-text follow-up. */
	askExtraInput: boolean;
}

/**
 * The reasons captured from `/api/config/app` on 2026-09-01, in served order.
 *
 * A fallback, not a whitelist: nothing validates against this list, and the
 * endpoint accepts whatever the served config offered.
 */
export const FALLBACK_REASONS: readonly PauseReason[] = [
	{ type: 'illness', label: 'Illness', askExtraInput: false },
	{ type: 'injury', label: 'Injury', askExtraInput: true },
	{ type: 'holiday', label: 'Holiday', askExtraInput: false },
	{ type: 'motivation', label: 'Motivation', askExtraInput: true },
	{ type: 'other', label: 'Other', askExtraInput: true }
];

/** Sorted by `order`, which is what the field is for; ties keep served order. */
function byOrder(a: PauseType, b: PauseType): number {
	return (a.order ?? 0) - (b.order ?? 0);
}

/**
 * The reasons to offer, from the served config when there is one.
 *
 * An entry with no `type` is dropped rather than rendered: it would be a radio
 * that posts nothing and is refused, which is worse than an option that is not
 * there. An entry with no `title` keeps its wire value as the label — unhelpful,
 * but honest, and better than a blank row.
 */
export function pauseReasons(config: AppConfig | null | undefined): PauseReason[] {
	const served = config?.pause_types;
	if (!served?.length) return [...FALLBACK_REASONS];

	const usable = served.filter((reason) => typeof reason?.type === 'string' && reason.type !== '');
	if (!usable.length) return [...FALLBACK_REASONS];

	return [...usable].sort(byOrder).map((reason) => ({
		type: reason.type,
		label: reason.title || reason.type,
		askExtraInput: reason.ask_extra_input === true
	}));
}

/** The reason matching a wire value, or null — for labelling `pause_cause`. */
export function pauseReasonLabel(
	type: string | null | undefined,
	config?: AppConfig | null
): string | null {
	if (!type) return null;
	const match = pauseReasons(config).find((reason) => reason.type === type);
	if (match) return match.label;

	// An unregistered value still says more spelled out than left as a wire
	// token: `pause_cause` is read back from an account that may have been
	// paused from the mobile app, on a reason this config never listed.
	const spaced = type.replace(/_/g, ' ');
	return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
