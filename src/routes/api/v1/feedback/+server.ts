import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { trainingApi } from '$lib/server/trenara';
import { passthrough } from '$lib/server/trenara/request';
import { rpeFeedbackSchema } from '$lib/schemas/feedback';

export const PUT: RequestHandler = async ({ request, cookies }) => {
	const body = await request.json();
	const result = rpeFeedbackSchema.safeParse(body);

	if (!result.success) {
		error(400, 'Invalid request body');
	}

	const { entryId, feedback } = result.data;
	return json(await passthrough(() => trainingApi.putFeedback(cookies, entryId, feedback)));
};
