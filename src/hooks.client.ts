import type { HandleClientError } from '@sveltejs/kit/hooks';

/**
 * Report an unexpected error thrown in the browser by what it actually said.
 *
 * Since SvelteKit 3 a component that throws after hydration does not reach a
 * `<svelte:boundary>` as itself: the root is mounted with a `transformError`
 * that runs it through this hook first, and the boundary's `failed` snippet is
 * handed whatever comes back. Without a hook of our own that was SvelteKit's
 * default, `{ message: 'Internal Error' }` — so the line `RenderFailure`
 * prints for whoever is trying a preview deployment named nothing at all,
 * and the throw itself was only in a console nobody opens on a phone.
 *
 * The message is safe to show here in a way it is not on the server: it was
 * raised in this runner's own browser, from data this page already holds, and
 * goes nowhere but back onto the same screen. `kind: 'app'` and
 * `kind: 'framework'` already carry the status and wording meant for the
 * runner, so they are left alone, as `hooks.server.ts` does.
 */
export const handleError: HandleClientError = ({ kind, error, event }) => {
	if (kind !== 'unknown') return;

	console.error(`[${event.route.id ?? event.url.pathname}] unexpected error:`, error);

	const message = error instanceof Error ? error.message : String(error);
	return message ? { message } : undefined;
};
