import { error } from '@sveltejs/kit';
import { goalShareDAO } from '$lib/server/db/goal-share';
import { predictionHistoryDAO } from '$lib/server/db/prediction-history';
import { toChartData } from '$lib/server/history/chart-points';
import { fromStorage, STORAGE_READ_MESSAGE } from '$lib/server/db/errors';
import { isShareToken } from '$lib/server/share/token';
import { sharedSnapshotSchema } from '$lib/schemas/share';
import { shareViews } from '$lib/server/security/rate-limit';
import type { PageServerLoad } from './$types';

/**
 * A goal, shown to whoever holds the link.
 *
 * This route sits outside `/api` and outside `(app)`, which is exactly why it
 * needs no change to `handleGuard` in `hooks.server.ts`: that hook only gates
 * those two prefixes, and everything else — this route included — passes
 * through unauthenticated by construction. There is no session to check here:
 * the token in the path *is* the authorisation, and the row it resolves to is
 * what says whose data it authorises reading.
 *
 * No Trenara request happens on this path at all. What renders is a
 * projection the owner's own page loads wrote earlier — see
 * `$lib/server/share/snapshot.ts` — plus a live read of this app's own
 * `prediction_history`, scoped to the share row's `user_id` and never to
 * anything a visitor's request carries.
 *
 * Not prerendered: the read is per-token and rate-limited by the visitor's
 * own IP, which `getClientAddress()` below already disqualifies from
 * prerendering on its own, but the intent is worth stating rather than
 * relying on that as the only reason.
 */
export const prerender = false;
export const ssr = true;
export const csr = true;

/** A minute of caching absorbs a refresh-hammering visitor without ever showing a number older than the snapshot already is. */
const CACHE_CONTROL = 'public, max-age=60';

export const load: PageServerLoad = async ({ params, getClientAddress, setHeaders }) => {
	setHeaders({
		'x-robots-tag': 'noindex, nofollow',
		// The token lives in the URL's own path, so it is exactly what a
		// `Referer` header would hand to anything this page ever links to or
		// loads — the footer's link back to the app today, and whatever gets
		// added later. `no-referrer` is what stops that, and it is set here
		// rather than left to `securityHeaders`' default because that default
		// is deliberately the looser `strict-origin-when-cross-origin` — see
		// `$lib/server/security/headers.ts` for why a route's own value, once
		// set, is left alone rather than overwritten on the way out.
		'referrer-policy': 'no-referrer',
		'cache-control': CACHE_CONTROL
	});

	const limit = shareViews.check(`share-view:${getClientAddress()}`);
	if (!limit.allowed) {
		error(429, 'Too many requests. Please try again shortly.');
	}

	// A malformed token is answered the same as one that parses but matches
	// nothing — see below — without spending a query on it.
	if (!isShareToken(params.token)) {
		error(404, 'This link is no longer available.');
	}

	const share = await fromStorage(
		() => goalShareDAO.getLiveByToken(params.token),
		STORAGE_READ_MESSAGE
	);

	// Revoked and unknown answer identically: telling them apart would make
	// this route an oracle for which tokens were ever real.
	if (!share) {
		error(404, 'This link is no longer available.');
	}

	// The stored snapshot crosses a deploy boundary — written by whichever
	// version of this app was running when the owner last opened it, read by
	// whichever version is running now. A cast would turn a shape change into
	// a `TypeError` on this, the most public page in the app; a parse turns it
	// into the same "not updated yet" state a link with no snapshot yet
	// already renders. See "Evolving the snapshot" in
	// `.kiro/specs/goal-sharing/design.md`.
	const parsed = sharedSnapshotSchema.safeParse(share.snapshot);
	const snapshot = parsed.success ? parsed.data : null;

	if (!snapshot) {
		return {
			title: share.title,
			name: share.display_name,
			snapshotAt: null,
			goal: null,
			userStats: null,
			history: { records: [], error: null }
		};
	}

	// The only owner-scoped read on this route, and it is scoped by the share
	// row the token resolved to — never by anything the request itself
	// carries. `predictionHistoryDAO.getUserPredictionHistory` still carries
	// its own `.eq('user_id', …)`, same as every other caller.
	let history: { records: ReturnType<typeof toChartData>; error: string | null };
	try {
		const records = await predictionHistoryDAO.getUserPredictionHistory(share.user_id, {
			startDate: snapshot.goal.start_date,
			limit: 200
		});
		history = { records: toChartData(records), error: null };
	} catch {
		history = { records: [], error: STORAGE_READ_MESSAGE };
	}

	return {
		title: share.title,
		name: share.display_name,
		snapshotAt: share.snapshot_at,
		goal: snapshot.goal,
		userStats: { best_times: snapshot.best_times, graph_stats: { goal: snapshot.plan_weeks } },
		history
	};
};
