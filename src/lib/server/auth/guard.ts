import { error } from '@sveltejs/kit';

/** The signed-in runner, once `requireUser` has vouched for them. */
export type SessionUser = NonNullable<App.Locals['user']>;

/**
 * The signed-in runner, or a 401.
 *
 * The real gate is in `hooks.server.ts`, which turns an unauthenticated
 * request away before any route runs. This is what a route uses to *read* the
 * runner, and it exists because `locals.user` is typed nullable and a route
 * that reaches for `locals.user!.id` is asserting something it has not
 * checked — which is exactly how the dashboard ended up with no guard at all
 * while every other route had one.
 *
 * So: no route asserts, every route asks, and the answer is narrowed.
 */
export function requireUser(locals: App.Locals): SessionUser {
	if (!locals.user) {
		error(401, 'Unauthorized');
	}
	return locals.user;
}
