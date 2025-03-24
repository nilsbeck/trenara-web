import { trainingApi, type ChangedDateResonse } from '$lib/server/api';
import { json, type RequestEvent } from '@sveltejs/kit';

export const PUT = async (event: RequestEvent) => {
	const { entryId, newDate, includeFuture } = await event.request.json();
	const response = trainingApi.testChangeDate(
		event.cookies,
		entryId,
		newDate,
		includeFuture
	);

	return json(response)
};

