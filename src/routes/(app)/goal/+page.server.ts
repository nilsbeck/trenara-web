import { trainingApi, userApi } from '$lib/server/trenara';
import { passthrough, passthroughOptional } from '$lib/server/trenara/request';
import type { PageServerLoad } from './$types';

/**
 * The goal card and the predictions table, streamed.
 *
 * Both go through `passthrough`, which every other route has had since the
 * connection work and this one did not: without it a refusal arrives as
 * whatever Trenara worded it as, or as nothing at all, and the page had no way
 * to tell a rate limit from an outage from an expired session. They are the
 * whole of this page, so a failure is allowed to fail it — but it has to fail
 * it with a reason attached.
 *
 * The goal itself is read as optional. Deleting a goal in Trenara makes
 * `/api/goal` answer 404 `{"message":"No result found"}`, and relaying that
 * faithfully put "No result found" on the page in error red, under a "Try
 * again" button that could only ever produce the same 404 — a normal, chosen
 * state of the account reported as a fault. `passthroughOptional` turns that
 * one status into `null` for the page to render an empty state from, and
 * leaves every other failure exactly as it was.
 */
export const load: PageServerLoad = async ({ cookies }) => {
	return {
		goal: passthroughOptional(() => trainingApi.getGoal(cookies)),
		userStats: passthrough(() => userApi.getUserStats(cookies))
	};
};
