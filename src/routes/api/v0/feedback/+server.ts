import { trainingApi } from "$lib/server/api";
import { json } from "@sveltejs/kit";
import type { RequestEvent } from "@sveltejs/kit";

export const PUT = async (event: RequestEvent) => {
    try {
        const { entryId, feedback } = await event.request.json();
        await trainingApi.putFeedback(event.cookies, entryId, feedback);
        return json({ success: true });
    } catch (error) {
        console.error('Feedback API error:', error);
        return json({ success: false }, { status: 500 });
    }
}
