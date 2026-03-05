import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { trainingApi } from '$lib/server/trenara';
import { TokenType } from '$lib/server/auth/types';
import { addTrainingSchema } from '$lib/schemas/training';

export const POST: RequestHandler = async ({ request, cookies }) => {
	if (!cookies.get(TokenType.AccessToken)) {
		error(401, 'Unauthorized');
	}

	const body = await request.json();
	const result = addTrainingSchema.safeParse(body);

	if (!result.success) {
		error(400, result.error.issues[0].message);
	}

	const { name, timeInSeconds, date, distanceInKm } = result.data;
	const utcDate = new Date(date + 'T00:00:00.000Z').toISOString();

	const data = await trainingApi.addTraining(cookies, name, timeInSeconds, utcDate, distanceInKm);
	return json(data);
};
