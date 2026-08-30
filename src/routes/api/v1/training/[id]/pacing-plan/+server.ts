import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { trainingApi } from '$lib/server/trenara';
import { parseBody, parseTrainingId, passthrough } from '$lib/server/trenara/request';
import { setPacingPlanSchema } from '$lib/schemas/training';

/** Choose a pacing strategy for the goal race. Gated by `can_change_pacing_plan`. */
export const PUT: RequestHandler = async ({ params, request, cookies }) => {
	const id = parseTrainingId(params.id);
	const body = parseBody(setPacingPlanSchema, await request.json());

	return json(await passthrough(() => trainingApi.setPacingPlan(cookies, id, body.pacingPlan)));
};
