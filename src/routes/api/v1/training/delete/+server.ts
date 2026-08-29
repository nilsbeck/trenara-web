import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { trainingApi } from '$lib/server/trenara';
import { passthrough } from '$lib/server/trenara/request';

export const DELETE: RequestHandler = async ({ request, cookies, locals }) => {
	if (!locals.user) {
		error(401, 'Unauthorized');
	}

	const body = await request.json();
	const trainingId = body?.trainingId;
	// type: 'entry' (default) → delete a completed entry
	//       'scheduled'       → delete a scheduled (future) training from the plan
	const type: string = body?.type ?? 'entry';

	if (typeof trainingId !== 'number' || !Number.isFinite(trainingId) || trainingId <= 0) {
		error(400, 'Missing or invalid trainingId');
	}

	if (type !== 'entry' && type !== 'scheduled') {
		error(400, 'Invalid type (must be "entry" or "scheduled")');
	}

	return json(
		await passthrough(() =>
			type === 'scheduled'
				? trainingApi.deleteScheduledTraining(cookies, trainingId)
				: trainingApi.deleteTraining(cookies, trainingId)
		)
	);
};
