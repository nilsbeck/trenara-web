import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { trainingApi } from '$lib/server/trenara';
import { parseTrainingId, passthrough } from '$lib/server/trenara/request';

/**
 * Full detail for one scheduled training.
 *
 * The week response omits every capability flag and change package, so this is
 * the only place the session-setup UI can learn what it is allowed to offer.
 */
export const GET: RequestHandler = async ({ params, cookies }) => {
	const id = parseTrainingId(params.id);
	return json(await passthrough(() => trainingApi.getTraining(cookies, id)));
};
