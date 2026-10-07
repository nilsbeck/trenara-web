import { error, json, type Cookies } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { trainingApi } from '$lib/server/trenara';
import { parseBody, passthrough } from '$lib/server/trenara/request';
import { addNewTrainingSchema, newTrainingDaySchema } from '$lib/schemas/training';
import { parseLocalDateString, toLocalDateString, weekAnchorOf } from '$lib/utils/date';
import type { Schedule } from '$lib/server/trenara/types';
import type { NewTrainingOptions } from '$lib/utils/schedule';

/**
 * The week that holds `day`, read the way the calendar's month fetch reads it.
 *
 * The browser never sees a week's id — the calendar holds weeks merged into a
 * month, ids dropped — so the upstream path's `{id}` is found here, from the
 * day. Asked with the month's own anchor for that week, so it is usually the
 * copy the month fetch already cached rather than another upstream request.
 */
async function weekHolding(cookies: Cookies, day: string): Promise<Schedule | null> {
	const date = parseLocalDateString(day);
	if (!date) error(400, `date: Not a calendar day, got "${day}"`);

	const anchor = weekAnchorOf(date);
	const week = await passthrough(() =>
		trainingApi.getSchedule(cookies, Math.floor(anchor.getTime() / 1000))
	);

	// A week that does not run over the day asked about is not one to add to;
	// rather than guess at another, say nothing can be added.
	const start = parseLocalDateString(week.start_day_long ?? '');
	if (!week.id || !start) return null;
	const end = new Date(start);
	end.setDate(end.getDate() + 7);
	return day >= toLocalDateString(start) && day < toLocalDateString(end) ? week : null;
}

/** What could be added on a day, and whether its week will take anything at all. */
export const GET: RequestHandler = async ({ url, cookies }) => {
	const { date } = parseBody(newTrainingDaySchema, { date: url.searchParams.get('date') });

	const week = await weekHolding(cookies, date);
	if (!week?.can_receive_new_trainings) {
		return json({ canAdd: false, candidates: [] } satisfies NewTrainingOptions);
	}

	const candidates = await passthrough(() => trainingApi.getNewTrainings(cookies, week.id, date));
	return json({ canAdd: true, candidates } satisfies NewTrainingOptions);
};

/**
 * Add one of those candidates on `date`.
 *
 * The week is read again here rather than trusting the picker: the browser's
 * list can be minutes old, and a second tab may have filled the week since.
 * Answers with the new training; the caller refreshes the plan, because
 * Trenara can rework the rest of the week around it.
 */
export const POST: RequestHandler = async ({ request, cookies }) => {
	const { date, candidateId } = parseBody(addNewTrainingSchema, await request.json());

	const week = await weekHolding(cookies, date);
	if (!week?.can_receive_new_trainings) {
		error(409, 'This week cannot take another training.');
	}

	return json(
		await passthrough(() => trainingApi.addNewTraining(cookies, week.id, date, candidateId))
	);
};
