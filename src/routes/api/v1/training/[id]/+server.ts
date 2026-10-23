import type { RequestHandler } from './$types';
import { trainingApi } from '#lib/server/trenara/index.js';
import { parseTrainingId, passthrough } from '#lib/server/trenara/request.js';

/**
 * Full detail for one scheduled training.
 *
 * The week response omits every capability flag and change package, so this is
 * the only place the session-setup UI can learn what it is allowed to offer.
 */
export const GET: RequestHandler = async ({ params, cookies }) => {
	const id = parseTrainingId(params.id);
	return Response.json(await passthrough(() => trainingApi.getTraining(cookies, id)));
};
