import type { UserStats } from '$lib/server/trenara/types';

/**
 * Whether a stats payload is one the cards can actually be rendered against.
 *
 * Both cards read `best_times` without a guard — the predictions table is
 * nothing but that block, and the goal card reads the goal time and pace out
 * of it — so a response that arrives without it is not a stats payload as far
 * as these pages are concerned, however truthy it is. An empty object, or an
 * upstream error page served with a 200, sails past a plain `userStats &&`
 * and then throws halfway through rendering, taking the whole page down
 * instead of falling back to the "could not be loaded" line already written
 * for exactly this case.
 *
 * Deliberately narrow. `graph_stats` is read through optional chaining
 * everywhere it is used, so a payload missing that still renders — with empty
 * graphs, which is the honest picture rather than a blank page.
 */
export function isRenderableStats(stats: UserStats | null | undefined): stats is UserStats {
	return Boolean(stats?.best_times);
}
