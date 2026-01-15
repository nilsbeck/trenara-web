import { chatApi } from '$lib/server/api';
import { json, type RequestEvent } from '@sveltejs/kit';

export const GET = async (event: RequestEvent) => {
	try {
		const threads = await chatApi.getThreads(event.cookies);
		return json(threads);
	} catch (error) {
		console.error('Failed to get threads:', error);
		return json({ error: 'Failed to fetch threads' }, { status: 500 });
	}
};

export const POST = async (event: RequestEvent) => {
	try {
		const thread = await chatApi.createThread(event.cookies);
		return json(thread);
	} catch (error) {
		console.error('Failed to create thread:', error);
		return json({ error: 'Failed to create thread' }, { status: 500 });
	}
};
