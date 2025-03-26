import { trainingApi } from '$lib/server/api';
import { json, type RequestEvent } from '@sveltejs/kit';

export const POST = async (event: RequestEvent) => {
	const { name, timeInSeconds, date, distanceInKm } = await event.request.json();
	const testResponse = await trainingApi.addTraining(
		event.cookies,
		name,
		timeInSeconds,
		date,
        distanceInKm
	);

	return json(testResponse)
};
