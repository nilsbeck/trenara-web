import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { TokenManager } from '$lib/server/auth/token-manager';

/**
 * Ends the session.
 *
 * POST, not GET. It used to be a `load`, which meant any page anywhere could
 * sign a runner out with `<img src="https://…/logout">` — the one mutation in
 * the app that escaped SvelteKit's origin check, because a GET was never
 * subject to it. Nothing was at stake but the session, which is why this sat
 * at the bottom of the list rather than the top; it is still a state change
 * that a third party should not be able to make.
 *
 * A POST from another origin cannot carry the cookies (`sameSite: 'lax'`) and
 * is refused by SvelteKit's CSRF check besides.
 */
export const POST: RequestHandler = async ({ cookies }) => {
	await TokenManager.getInstance().logout(cookies);
	redirect(303, '/login');
};
