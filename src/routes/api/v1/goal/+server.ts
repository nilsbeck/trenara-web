import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { trainingApi } from '$lib/server/trenara';
import { passthrough } from '$lib/server/trenara/request';

/**
 * Delete the current goal.
 *
 * Takes no body: there is exactly one current goal per account and it is
 * identified by the token, so there is nothing for the client to name — and
 * nothing for it to name wrongly. Upstream answers `{"message":"Success."}`,
 * relayed as-is.
 *
 * DELETE rather than a POST to a `/delete` path, so SvelteKit's origin check
 * covers it — see the CSRF note in `agents.md`.
 */
export const DELETE: RequestHandler = async ({ cookies }) => {
	return json(await passthrough(() => trainingApi.deleteGoal(cookies)));
};
