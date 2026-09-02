import { json, error, type Cookies } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireUser } from '$lib/server/auth/guard';
import { trainingApi, userApi } from '$lib/server/trenara';
import { passthrough, passthroughOptional, parseBody } from '$lib/server/trenara/request';
import { goalShareDAO } from '$lib/server/db/goal-share';
import { fromStorage, STORAGE_WRITE_MESSAGE } from '$lib/server/db/errors';
import { refreshShareSnapshot } from '$lib/server/share/refresh';
import { shareTitleSchema } from '$lib/schemas/share';
import { storageWrites } from '$lib/server/security/rate-limit';

/**
 * Creating, rotating and revoking a link to the runner's own goal.
 *
 * No `GET`: the dialog's opening state — is there a live link, and what is
 * its URL — comes from `/goal`'s own `load` instead, which streams the share
 * row alongside `goal` and `userStats`. Per §5 of `agents.md`, an `onMount`
 * fetch is not the way to get data a `load` can already hold, and a `load`
 * already runs server-side with the runner resolved. This file is left with
 * only the three writes, each on a method that is not GET.
 */

/** The Trenara goal id this runner currently holds, never one a request names. */
async function currentGoalId(cookies: Cookies): Promise<number> {
	const goal = await passthroughOptional(() => trainingApi.getGoal(cookies));
	if (!goal) error(400, 'There is no active goal to share.');
	return goal.id;
}

/** `title`, trimmed and capped at 80, or null for "no title given". Empty reads as none. */
async function parseTitle(request: Request): Promise<string | null> {
	const body = await request.json().catch(() => ({}));
	const { title } = parseBody(shareTitleSchema, body);
	const trimmed = title?.trim().slice(0, 80);
	return trimmed && trimmed.length > 0 ? trimmed : null;
}

function shareUrl(origin: string, token: string): string {
	return `${origin}/s/${token}`;
}

/**
 * Create a link for the runner's current goal — or, if one is already live,
 * hand back that one untouched.
 *
 * Idempotent on purpose: a single `POST` meaning "create or regenerate" made
 * a double tap, or a retry over a flaky connection, capable of silently
 * killing a link the runner had already pasted into a message. Rotating a
 * live link is `PUT`, a distinct request a runner has to ask for.
 *
 * Writes the first snapshot in the same request — from the same goal and
 * stats read to resolve the goal id — so a freshly created link is never
 * shown as "not updated yet" for longer than it has to be. That write is
 * best-effort and cannot fail the create itself; the next page load fills it
 * in regardless, via `keepHistory`.
 */
export const POST: RequestHandler = async ({ cookies, request, locals, url }) => {
	const user = requireUser(locals);

	const limit = storageWrites.check(`goal-share:${user.id}`);
	if (!limit.allowed) {
		error(429, 'Too many updates. Please slow down.');
	}

	const [goal, title, account] = await Promise.all([
		passthroughOptional(() => trainingApi.getGoal(cookies)),
		parseTitle(request),
		passthrough(() => userApi.getCurrentUser(cookies))
	]);
	if (!goal) error(400, 'There is no active goal to share.');

	const existing = await fromStorage(
		() => goalShareDAO.getForGoal(user.id, goal.id),
		STORAGE_WRITE_MESSAGE
	);
	if (existing) {
		return json({
			token: existing.token,
			title: existing.title,
			url: shareUrl(url.origin, existing.token)
		});
	}

	const issued = await fromStorage(
		() => goalShareDAO.issue(user.id, goal.id, { title, display_name: account.first_name || null }),
		STORAGE_WRITE_MESSAGE
	);

	const stats = await userApi.getUserStats(cookies).catch(() => null);
	await refreshShareSnapshot(user.id, goal, stats);

	return json({
		token: issued.token,
		title: issued.title,
		url: shareUrl(url.origin, issued.token)
	});
};

/**
 * Rotate the token on the runner's live link — the explicit "Create new
 * link", never reachable by repeating `POST`. Creates one if none exists,
 * for the same reason `issue` reactivates a revoked row rather than
 * requiring `POST` first: a runner asking to (re)generate a link should not
 * have to know which state it was already in.
 *
 * The prior snapshot rides along — `issue` only ever changes the token, the
 * title and the display name — so a regenerated link starts life exactly as
 * fresh as the one it replaced, not blank.
 */
export const PUT: RequestHandler = async ({ cookies, request, locals, url }) => {
	const user = requireUser(locals);

	const limit = storageWrites.check(`goal-share:${user.id}`);
	if (!limit.allowed) {
		error(429, 'Too many updates. Please slow down.');
	}

	const [goalId, title, account] = await Promise.all([
		currentGoalId(cookies),
		parseTitle(request),
		passthrough(() => userApi.getCurrentUser(cookies))
	]);

	const issued = await fromStorage(
		() => goalShareDAO.issue(user.id, goalId, { title, display_name: account.first_name || null }),
		STORAGE_WRITE_MESSAGE
	);

	return json({
		token: issued.token,
		title: issued.title,
		url: shareUrl(url.origin, issued.token)
	});
};

/**
 * Revoke the runner's live link for their current goal.
 *
 * Idempotent: revoking a link that is already revoked, or one that never
 * existed, is not an error — `goalShareDAO.revoke` answers `{ revoked: false
 * }` for both rather than raising.
 */
export const DELETE: RequestHandler = async ({ cookies, locals }) => {
	const user = requireUser(locals);

	const limit = storageWrites.check(`goal-share:${user.id}`);
	if (!limit.allowed) {
		error(429, 'Too many updates. Please slow down.');
	}

	const goalId = await currentGoalId(cookies);
	const result = await fromStorage(
		() => goalShareDAO.revoke(user.id, goalId),
		STORAGE_WRITE_MESSAGE
	);

	return json(result);
};
