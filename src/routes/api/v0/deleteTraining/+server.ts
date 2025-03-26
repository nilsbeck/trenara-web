import { trainingApi } from '$lib/server/api';
import { json, type RequestEvent } from '@sveltejs/kit';

export const DELETE = async (event: RequestEvent) => {
	const { trainingId } = await event.request.json();
	const testResponse = await trainingApi.deleteTraining(
		event.cookies,
        trainingId
	);

	return json(testResponse)
};
