import type { AppConfig } from '$lib/server/trenara/types';

/**
 * The served app configuration, once the layout has it.
 *
 * A module-level holder rather than context or a prop chain: the option lists
 * are wanted several components deep — the session sheet, a toast raised from a
 * store — and threading one immutable object through every layer in between
 * would be all cost and no benefit.
 *
 * `null` until the layout's streamed promise resolves, and null for good when
 * the request failed. Both mean the same thing to a caller: fall back to the
 * constants.
 */
let config = $state<AppConfig | null>(null);

export const appConfig = {
	get current(): AppConfig | null {
		return config;
	},
	set(value: AppConfig | null) {
		config = value;
	}
};
