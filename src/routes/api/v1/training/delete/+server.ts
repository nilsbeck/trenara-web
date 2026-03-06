import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { trainingApi } from '$lib/server/trenara';
import { TokenType } from '$lib/server/auth/types';

export const DELETE: RequestHandler = async ({ request, cookies }) => {
	if (!cookies.get(TokenType.AccessToken)) {
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

	if (type === 'scheduled') {
		const data = await trainingApi.deleteScheduledTraining(cookies, trainingId);
		return json(data);
	}

	const data = await trainingApi.deleteTraining(cookies, trainingId);
	return json(data);
};
