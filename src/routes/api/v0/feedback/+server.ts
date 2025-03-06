import { trainingApi } from "$lib/server/api";
import { json } from "@sveltejs/kit";
import type { RequestEvent } from "@sveltejs/kit";

export const PUT = async (event: RequestEvent) => {
    const { entryId, feedback } = await event.request.json();
    const response = await trainingApi.putFeedback(event.cookies, entryId, feedback);

    if (response.status === 200) {
        return json({ success: true });
    }

    return json({ success: false });
}
