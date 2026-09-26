import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { trainingApi } from '$lib/server/trenara';
import { parseBody, passthrough } from '$lib/server/trenara/request';
import { deleteTrainingSchema } from '$lib/schemas/training';

/** Delete a filed entry or a scheduled training; see `deleteTrainingSchema`. */
export const DELETE: RequestHandler = async ({ request, cookies }) => {
	const { trainingId, type } = parseBody(deleteTrainingSchema, await request.json());

	return json(
		await passthrough(() =>
			type === 'scheduled'
				? trainingApi.deleteScheduledTraining(cookies, trainingId)
				: trainingApi.deleteTraining(cookies, trainingId)
		)
	);
};
