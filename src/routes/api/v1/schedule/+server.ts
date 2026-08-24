import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { trainingApi } from '$lib/server/trenara';
import { fingerprint } from '$lib/utils/fingerprint';

function daysInMonth(year: number, month: number): number {
	return new Date(year, month + 1, 0).getDate();
}

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

	const month = date.getMonth();
	const year = date.getFullYear();
	const firstDayOfMonthDate = new Date(year, month, 1);
	const firstDayOfMonth = firstDayOfMonthDate.getDay();

	const nextMonday = new Date(firstDayOfMonthDate);
	nextMonday.setDate(nextMonday.getDate() + ((1 + 7 - firstDayOfMonthDate.getDay()) % 7 || 7));
	const offsetAtStart = firstDayOfMonth === 0 ? firstDayOfMonth + 6 : firstDayOfMonth - 1;
	const weeksInMonth = Math.ceil((offsetAtStart + daysInMonth(year, month)) / 7);

	const timestamps: Date[] = [firstDayOfMonthDate];
	timestamps.push(new Date(nextMonday));

	for (let i = timestamps.length; i < weeksInMonth; i++) {
		nextMonday.setDate(nextMonday.getDate() + 7);
		timestamps.push(new Date(nextMonday));
	}

	const schedules = await Promise.all(
		timestamps.map((ts) => trainingApi.getSchedule(cookies, Math.floor(ts.getTime() / 1000)))
	);

	const merged = {
		id: 0,
		start_day: 0,
		start_day_long: '',
		training_week: 0,
		type: 'ultimate' as const,
		trainings: schedules.flatMap((s) => s.trainings),
		strength_trainings: schedules.flatMap((s) => s.strength_trainings),
		entries: schedules.flatMap((s) => s.entries)
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

	// The client already holds this exact month. Nothing to send.
	if (request.headers.get('if-none-match') === etag) {
		return new Response(null, { status: 304, headers });
	}

	return new Response(body, {
		status: 200,
		headers: { ...headers, 'content-type': 'application/json' }
	});
};
