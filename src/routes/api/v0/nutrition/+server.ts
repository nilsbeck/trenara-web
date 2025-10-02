import { trainingApi } from '$lib/server/api';
import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';

export const GET = async (event: RequestEvent) => {
    try {
        const timestamp = event.url.searchParams.get('timestamp');
        if (!timestamp) {
            return json({ error: 'Timestamp is required' }, { status: 400 });
        }

        const nutrition = await trainingApi.getNutrition(event.cookies, timestamp);
        return json(nutrition);
    } catch (error) {
        console.error('Nutrition API error:', error);
        return json({ error: 'Failed to fetch nutrition data' }, { status: 500 });
    }
};
