import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { trainingApi } from '$lib/server/trenara';
import { fingerprint } from '$lib/utils/fingerprint';
import { getMonthTimestamps, parseLocalDateString, weeksStillOpen } from '$lib/utils/date';
import type { SchedulePayload } from '$lib/utils/schedule';

export const GET: RequestHandler = async ({ url, request, cookies, locals }) => {
	if (!locals.user) {
		error(401, 'Unauthorized');
	}

	const dateParam = url.searchParams.get('date');
	const dateMs = dateParam ? Number(dateParam) : NaN;
	const date = Number.isFinite(dateMs) ? new Date(dateMs) : new Date();

	// Guard against invalid dates (NaN timestamp, out-of-range values)
	if (isNaN(date.getTime())) {
		error(400, 'Invalid date parameter');
	}

	let timestamps = getMonthTimestamps(date);
	let coveredFrom: string | null = null;

	/**
	 * `from` says the caller already holds this month and only wants the weeks
	 * that can still change. A week that ended before it is settled, so the
	 * upstream calls for it are skipped entirely — in the back half of a month
	 * that is most of them.
	 *
	 * A `from` that would leave nothing to fetch is ignored rather than answered
	 * with an empty month: the caller is expected not to ask about a month
	 * wholly in the past, and if they do, the whole month is the safe answer.
	 */
	const fromParam = url.searchParams.get('from');
	if (fromParam) {
		const from = parseLocalDateString(fromParam);
		if (!from) {
			error(400, 'Invalid from parameter');
		}
		const open = weeksStillOpen(timestamps, from);
		if (open.anchors.length > 0 && open.anchors.length < timestamps.length) {
			timestamps = open.anchors;
			coveredFrom = open.coveredFrom;
		}
	}

	const schedules = await Promise.all(
		timestamps.map((ts) => trainingApi.getSchedule(cookies, Math.floor(ts.getTime() / 1000)))
	);

	const merged: SchedulePayload = {
		id: 0,
		start_day: 0,
		start_day_long: '',
		training_week: 0,
		type: 'ultimate' as const,
		trainings: schedules.flatMap((s) => s.trainings),
		strength_trainings: schedules.flatMap((s) => s.strength_trainings),
		entries: schedules.flatMap((s) => s.entries),
		covered_from: coveredFrom
	};

	const body = JSON.stringify(merged);
	const etag = `W/"${fingerprint(body)}"`;

	const headers: Record<string, string> = {
		etag,
		// The plan changes under us — overnight, and whenever the coach moves a
		// session — so a stored copy is never good enough on its own. `no-cache`
		// keeps the copy but insists it be checked, which is what the ETag above
		// is for: unchanged weeks come back as 304 and cost nothing to send.
		'cache-control': 'private, no-cache, must-revalidate'
	};

	// The client already holds this exact answer. Nothing to send.
	if (request.headers.get('if-none-match') === etag) {
		return new Response(null, { status: 304, headers });
	}

	return new Response(body, {
		status: 200,
		headers: { ...headers, 'content-type': 'application/json' }
	});
};
