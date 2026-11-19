import type { RequestHandler } from './$types';
import { trainingApi } from '#lib/server/trenara/index.js';
import { parseTrainingId, passthrough, readBody } from '#lib/server/trenara/request.js';
import { setPacingPlanSchema } from '#lib/schemas/training.js';

/** Choose a pacing strategy for the goal race. Gated by `can_change_pacing_plan`. */
export const PUT: RequestHandler = async ({ params, request, cookies }) => {
	const id = parseTrainingId(params.id);
	const body = await readBody(setPacingPlanSchema, request);

	return Response.json(
		await passthrough(() => trainingApi.setPacingPlan(cookies, id, body.pacingPlan))
	);
};
