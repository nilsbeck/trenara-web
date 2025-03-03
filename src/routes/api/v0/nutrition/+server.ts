import { trainingApi } from '$lib/server/api/training';
import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';

export const GET = async (event: RequestEvent) => {
    const timestamp = event.url.searchParams.get('timestamp');
    if (!timestamp) {
        return json({ error: 'Timestamp is required' }, { status: 400 });
    }

    const nutrition = await trainingApi.getNutrition(event.cookies, timestamp);

    return json(nutrition);
};
