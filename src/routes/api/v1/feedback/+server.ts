import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { trainingApi } from '$lib/server/trenara';
import { TokenType } from '$lib/server/auth/types';
import { rpeFeedbackSchema } from '$lib/schemas/feedback';

export const PUT: RequestHandler = async ({ request, cookies }) => {
	if (!cookies.get(TokenType.AccessToken)) {
		error(401, 'Unauthorized');
	}

	const body = await request.json();
	const result = rpeFeedbackSchema.safeParse(body);

	if (!result.success) {
		error(400, 'Invalid request body');
	}

	const { entryId, feedback } = result.data;
	const data = await trainingApi.putFeedback(cookies, entryId, feedback);
	return json(data);
};
