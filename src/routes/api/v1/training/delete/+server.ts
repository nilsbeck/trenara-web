import type { RequestHandler } from './$types';
import { trainingApi } from '#lib/server/trenara/index.js';
import { parseBody, passthrough } from '#lib/server/trenara/request.js';
import { deleteTrainingSchema } from '#lib/schemas/training.js';

/**
 * Delete a filed entry or a scheduled training; see `deleteTrainingSchema`.
 *
 * A scheduled training is removed the way the mobile app removes one: the
 * `change_test` dry run, then `change_save`, both with `action: 'destroy'`.
 * The dry run's answer is not used here, but the app has only ever been
 * seen saving after asking, so this asks too rather than find out what a
 * bare save does. `include_future` is `false`, as in the move flow: the one
 * capture sent `true`, and what a removal extends to with it is untested —
 * possibly later sessions, which is not what a delete button promises.
 */
export const DELETE: RequestHandler = async ({ request, cookies }) => {
	const { trainingId, type } = parseBody(deleteTrainingSchema, await request.json());

	if (type === 'scheduled') {
		await passthrough(() => trainingApi.testRemoveTraining(cookies, trainingId, false));
		return Response.json(
			await passthrough(() => trainingApi.saveRemoveTraining(cookies, trainingId, false))
		);
	}

	return Response.json(await passthrough(() => trainingApi.deleteTraining(cookies, trainingId)));
};
